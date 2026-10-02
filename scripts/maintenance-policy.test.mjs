import {test} from 'node:test';
import assert from 'node:assert/strict';
import {offsiteCandidates,imageCandidates} from './maintenance-policy.mjs';
const hash = i => String(i).padStart(64,'0');
const now = 200*86400000;
test('offsite expiration preserves newest seven, restore-tested and incomplete backups',()=>{
  const groups=Array.from({length:12},(_,i)=>({hash:hash(i),database:true,secret:i!==10,modifiedAt:now-(100+i)*86400000}));
  assert.deepEqual(offsiteCandidates(groups,[hash(8)],now).map(g=>g.hash),[hash(7),hash(9),hash(11)]);
  assert.throws(()=>offsiteCandidates(groups,[],now),/restore-tested/);
});
test('recent and invalid-date backup copies do not expire',()=>{
  const groups=Array.from({length:9},(_,i)=>({hash:hash(i),database:true,secret:true,modifiedAt:i===8?NaN:now-i*86400000}));
  assert.deepEqual(offsiteCandidates(groups,[hash(0)],now),[]);
});
test('image cleanup preserves references, rollback tags, shared tags, dangling and recent images',()=>{
  const tag=i=>`deploypilot-00000000-0000-0000-0000-${String(i).padStart(12,'0')}:latest`;
  const images=Array.from({length:7},(_,i)=>({id:'sha256:'+hash(i),tags:[tag(i)],createdAt:0}));
  images[3].tags.push('unrelated:latest'); images[4].tags=[]; images[5].createdAt=now; images[6].createdAt=NaN;
  assert.deepEqual(imageCandidates(images,[images[0].id],[tag(1)],now).map(i=>i.id),[images[2].id]);
});
