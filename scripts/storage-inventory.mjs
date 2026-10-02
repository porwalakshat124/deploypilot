import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(join(root,'apps/api/package.json'));
const env=require('dotenv').parse(await readFile(join(root,'.env.operations')));
const response=await fetch('https://deploypilot-i4fj.onrender.com/v1/operations/storage',{headers:{Authorization:`Bearer ${env.OPERATIONS_ALERT_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(120000)});
if(!response.ok) throw new Error(`Storage inventory failed: HTTP ${response.status}`);
const r2=await response.json();
// Read-only. Never prune images, containers, or rollback artifacts.
const docker=execFileSync('docker',['system','df','--format','{{json .}}'],{encoding:'utf8',timeout:30000}).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const report={checkedAt:new Date().toISOString(),r2,docker,deletionEnabled:false};
await mkdir(join(root,'docs/verification'),{recursive:true});
await writeFile(join(root,'docs/verification/storage-inventory.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
