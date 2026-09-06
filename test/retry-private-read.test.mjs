import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retryPrivateRead} from '../lib/retry-private-read.ts';
test('temporary failures retry automatically with bounded backoff',async()=>{
  let calls=0;const delays=[];
  assert.equal(await retryPrivateRead(async()=>{if(++calls<3)throw {code:'CT_NOT_FOUND'};return 9;},()=>true,async ms=>{delays.push(ms);}),9);
  assert.deepEqual(delays,[1000,2000]);assert.equal(calls,3);
});
test('permissions and user rejection never loop automatically',async()=>{
  for(const code of ['ACP_DENIED','ACP_EXPIRED','4001','403']){
    let calls=0;await assert.rejects(retryPrivateRead(async()=>{calls++;throw {code};},()=>true,async()=>{}));assert.equal(calls,1);
  }
});
test('stale contexts discard late results and stop retries',async()=>{
  let current=true;let calls=0;
  await assert.rejects(retryPrivateRead(async()=>{calls++;current=false;return 4;},()=>current,async()=>{}),/View stopped/);assert.equal(calls,1);
});
test('timed-out attempts become inactive before a replacement read',async()=>{
  const attempts=[];
  await assert.rejects(retryPrivateRead(active=>{attempts.push(active);return new Promise(()=>{});},()=>true,async()=>{},5),/timeout/);
  assert.equal(attempts.length,4);assert.ok(attempts.every(active=>!active()));
});
test('only card reads are retried and no manual retry control is rendered',()=>{
  const hook=readFileSync(new URL('../components/poker/use-private-cards.ts',import.meta.url),'utf8');
  assert.match(hook,/retryPrivateRead\(active=>client.decryptForView/);
  assert.ok(hook.indexOf('authorizeCardView(client')<hook.indexOf('retryPrivateRead(active'));
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(page,/<CardPreparation|RETRY CARD ACCESS/);
});
