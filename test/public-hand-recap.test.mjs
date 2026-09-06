import test from 'node:test';
import assert from 'node:assert/strict';
import {publicHandRecap} from '../lib/public-hand-recap.ts';
import {readFileSync} from 'node:fs';

test('maps public showdown pairs only to eligible seats in contract order',()=>{
  const recap=publicHandRecap([0,1,2,3,4],['a','b','c'],[0,1,2],[10,11,12,13]);
  assert.deepEqual(recap.seats.map(seat=>seat.cards),[[10,11],undefined,[12,13]]);
  assert.equal(recap.seats[1].folded,true);
});
test('fold wins and invalid reveal payloads do not expose or invent hole cards',()=>{
  for(const values of [undefined,[10,10,12,13],[0,11,12,13],[10,11],[52,11,12,13]]){
    const recap=publicHandRecap([0,1,2,3,4],['a','b'],[0,2],values);
    assert.ok(recap.seats.every(seat=>!seat.cards));
  }
  assert.equal(publicHandRecap([0,0],['a'],[0]),undefined);
});
test('host setup is sequential and mascot is background-only',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  assert.match(page,/const startAndPrepare=.*await freshPrivateWrite\(.*functionName:'startHand'.*await prepareEncryptedCards\(\)/);
  assert.match(page,/decoded.functionName==='settleShowdown'&&decoded.args\[0\]===id/);
  assert.doesNotMatch(page,/<PokerMascot/);
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/poker-felt::before.*pointer-events:none.*card-shark.png/);
});
