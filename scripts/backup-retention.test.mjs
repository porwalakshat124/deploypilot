import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupCandidates } from './backup-retention.mjs';
test('retention preserves seven newest, latest restored and unverified copies',()=>{
  const now=100*86400000;
  const backups=Array.from({length:12},(_,i)=>({file:String(i),createdAt:now-(i+31)*86400000,offsite:i!==9,restored:i===8}));
  assert.deepEqual(backupCandidates(backups,now).map(b=>b.file),['7','10','11']);
});
test('no backup is removed when fewer than seven exist or it is newer than 30 days',()=>{
  assert.deepEqual(backupCandidates([{file:'a',createdAt:0,offsite:true}],100*86400000),[]);
  assert.deepEqual(backupCandidates(Array.from({length:9},(_,i)=>({file:String(i),createdAt:Date.now()-i*86400000,offsite:true}))),[]);
});
