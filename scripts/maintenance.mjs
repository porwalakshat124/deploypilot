import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {offsiteCandidates,imageCandidates} from './maintenance-policy.mjs';
const root=resolve(import.meta.dirname,'..'), require=createRequire(join(root,'apps/api/package.json'));
const env=require('dotenv').parse(await readFile(join(root,'.env')));
const {PrismaClient}=require('@prisma/client');
const {S3Client,ListObjectsV2Command,GetObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
const apply=process.argv.includes('--apply');
const scope=process.argv.find(arg=>arg.startsWith('--scope='))?.slice(8)??'all';
if (!['all','backups','images'].includes(scope)) throw new Error('Invalid maintenance scope');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000}).trim();
const report={checkedAt:new Date().toISOString(),apply,scope,backups:{candidates:0,removed:0},images:{candidates:0,removed:0}};
try {
  if(scope!=='images') {
    if(!env.R2_BUCKET || !env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error('Set all R2 settings privately, including R2_BUCKET, before backup maintenance; use --scope=images for Docker-only maintenance');
    const directory=resolve(process.env.DEPLOYPILOT_BACKUP_DIR??join(process.env.USERPROFILE??root,'.deploypilot-backups'));
    const protectedHashes=[];
    for(const name of await readdir(directory)) {
      if(!/^public-\d{4}-\d{2}-\d{2}T[\d-]+Z\.dpbackup\.json$/.test(name)) continue;
      const manifest=JSON.parse(await readFile(join(directory,name),'utf8'));
      try {
        const verified=JSON.parse(await readFile(join(directory,name.slice(0,-5)+'.verified.json'),'utf8'));
        if(verified.isolated===true && /^[a-f0-9]{64}$/.test(manifest.sha256)) protectedHashes.push(manifest.sha256);
      } catch(error) {if(error.code!=='ENOENT') throw error;}
    }
    const client=new S3Client({endpoint:env.R2_ENDPOINT,region:'auto',maxAttempts:2,requestHandler:{requestTimeout:15000,connectionTimeout:5000},credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}});
    const groups=new Map(); let token;
    for(let page=0;page<10;page++) {
      const result=await client.send(new ListObjectsV2Command({Bucket:env.R2_BUCKET,Prefix:'backups/',MaxKeys:1000,ContinuationToken:token}));
      for(const object of result.Contents??[]) {
        const match=object.Key?.match(/^backups\/([a-f0-9]{64})\/(database|secret-key)\.dpbackup$/);
        if(!match) continue;
        const group=groups.get(match[1])??{hash:match[1],modifiedAt:0};
        group[match[2]==='database'?'database':'secret']=object.Key;
        group.modifiedAt=Math.max(group.modifiedAt,object.LastModified?.getTime()??NaN); groups.set(match[1],group);
      }
      if(!result.IsTruncated) break;
      if(page===9 || !result.NextContinuationToken || token===result.NextContinuationToken) throw new Error('Backup inventory incomplete; no expiration allowed');
      token=result.NextContinuationToken;
    }
    const candidates=offsiteCandidates([...groups.values()],protectedHashes);
    report.backups.candidates=candidates.length;
    if(apply) for(const group of candidates) {
      // Authenticate both encrypted copies before removing either. Never inspect plaintext.
      for(const key of [group.database,group.secret]) {
        const object=await client.send(new GetObjectCommand({Bucket:env.R2_BUCKET,Key:key}));
        if(!object.Body || !object.ETag || object.ContentLength>128*1024*1024 || object.LastModified?.getTime()>group.modifiedAt) throw new Error('Backup changed or exceeds maintenance bounds');
        const bytes=await object.Body.transformToByteArray();
        const sha=createHash('sha256').update(bytes).digest('hex');
        if(bytes.length<32 || Buffer.from(bytes.subarray(0,4)).toString()!=='DPB1' || object.Metadata?.encrypted!=='aes-256-gcm' || object.Metadata?.sha256!==sha || (key===group.database && sha!==group.hash)) throw new Error('Backup integrity verification failed; copies preserved');
        group[key===group.database?'databaseEtag':'secretEtag']=object.ETag;
      }
      for(const [key,etag] of [[group.secret,group.secretEtag],[group.database,group.databaseEtag]]) await client.send(new DeleteObjectCommand({Bucket:env.R2_BUCKET,Key:key,IfMatch:etag}));
      report.backups.removed++;
    }
    client.destroy();
  }
  if(scope!=='backups') {
    const [runtimes,deployments]=await Promise.all([db.deploymentRuntime.findMany({take:10001,select:{imageId:true,deploymentId:true}}),db.deployment.findMany({where:{status:{in:['SUCCEEDED','QUEUED','RUNNING']}},take:10001,select:{id:true}})]);
    if(runtimes.length>10000 || deployments.length>10000) throw new Error('Reference inventory exceeds maintenance bounds');
    const referencedIds=runtimes.map(r=>r.imageId).filter(Boolean);
    const containerIds=docker(['ps','-aq','--no-trunc']).split(/\r?\n/).filter(Boolean);
    // Inspect only image IDs; never emit container environment variables.
    for(const id of containerIds) referencedIds.push(docker(['inspect','--format','{{.Image}}',id]));
    const protectedTags=[...runtimes.map(r=>r.deploymentId),...deployments.map(d=>d.id)].map(id=>'deploypilot-'+id+':latest');
    const ids=[...new Set(docker(['image','ls','-q','--no-trunc']).split(/\r?\n/).filter(Boolean))];
    const images=ids.map(id=>JSON.parse(docker(['image','inspect','--format','{"id":{{json .Id}},"tags":{{json .RepoTags}},"created":{{json .Created}}}',id]))).map(image=>({...image,tags:image.tags??[],createdAt:Date.parse(image.created)}));
    const candidates=imageCandidates(images,referencedIds,protectedTags); report.images.candidates=candidates.length;
    if(apply) for(const image of candidates) {
      // Refresh DB references immediately before removal; Docker refuses images in use.
      const deploymentIds=image.tags.map(tag=>tag.slice(12,-7));
      if(await db.deploymentRuntime.count({where:{OR:[{imageId:image.id},{deploymentId:{in:deploymentIds}}]}}) || await db.deployment.count({where:{id:{in:deploymentIds},status:{in:['SUCCEEDED','QUEUED','RUNNING']}}})) continue;
      docker(['image','rm',image.id]); report.images.removed++;
    }
  }
  await mkdir(join(root,'docs/verification'),{recursive:true});
  await writeFile(join(root,'docs/verification/maintenance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {await db.$disconnect();}
