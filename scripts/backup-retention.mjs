import { readdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
export function backupCandidates(backups, now = Date.now()) {
  const ordered = [...backups].sort((a,b) => b.createdAt - a.createdAt);
  const preserve = new Set(ordered.slice(0,7).map(b=>b.file));
  const restored = ordered.find(b=>b.restored);
  if(restored) preserve.add(restored.file);
  return ordered.filter(b=>!preserve.has(b.file) && b.offsite && b.createdAt < now - 30 * 86400000);
}
export async function retainBackups(directory) {
  directory = resolve(directory);
  const backups = [];
  for(const name of await readdir(directory)) {
    if(!/^public-\d{4}-\d{2}-\d{2}T[\d-]+Z\.dpbackup\.json$/.test(name)) continue;
    const manifest = JSON.parse(await readFile(join(directory,name),'utf8'));
    const file = resolve(manifest.file), secret = resolve(manifest.secret);
    if(dirname(file)!==directory || dirname(secret)!==directory || basename(file)+'.json'!==name || !/^secret-key-[\dTZ-]+\.dpbackup$/.test(basename(secret))) throw new Error('Backup retention path is outside its protected scope');
    let offsite = false, restored = false;
    try {
      const receipt = JSON.parse(await readFile(file+'.offsite.json','utf8'));
      const hash = createHash('sha256').update(await readFile(file)).digest('hex');
      const secretHash = createHash('sha256').update(await readFile(secret)).digest('hex');
      offsite = hash===manifest.sha256 && receipt.objects?.length===2 && receipt.objects.every(o=>o.verified) && receipt.objects.some(o=>o.sha256===hash) && receipt.objects.some(o=>o.sha256===secretHash);
      restored = JSON.parse(await readFile(file+'.verified.json','utf8')).isolated===true;
    } catch(error) { if(error.code!=='ENOENT') throw error; }
    backups.push({file,secret,createdAt:Date.parse(manifest.createdAt),offsite,restored});
  }
  const candidates = backupCandidates(backups);
  for(const backup of candidates) {
    for(const path of [backup.file,backup.secret,backup.file+'.json',backup.file+'.offsite.json',backup.file+'.verified.json']) {
      if(dirname(resolve(path))!==directory) throw new Error('Backup retention escaped its private directory');
      await rm(path,{force:true});
    }
  }
  return {days:30,removed:candidates.length,preserved:'seven newest backups, latest restore-tested backup, unverified copies and encryption key'};
}
