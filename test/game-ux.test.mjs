import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData} from 'viem';
import {buildDealCalls,shuffleAbi,DEAL_ROUTER} from '../lib/deal-batch.ts';
import {isOpenTable,recoveryAction} from '../lib/table-lifecycle.ts';
import {withDeadline} from '../lib/async-deadline.ts';
import {readFileSync} from 'node:fs';
import {competitionRank} from '../lib/reputation.ts';

test('equal Credit totals share a competition rank, regardless of list order',()=>{
  const totals=[2n,5n,2n,0n];
  assert.deepEqual(totals.map(score=>competitionRank(score,totals)),[2,1,2,4]);
  assert.equal(competitionRank(9007199254740993n,[9007199254740994n,9007199254740993n]),2);
});

test('table controls remain in document flow and explicit silent card reads cannot request new permission',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const view=readFileSync(new URL('../components/poker/use-private-cards.ts',import.meta.url),'utf8');
  const arena=readFileSync(new URL('../components/poker/poker-arena.tsx',import.meta.url),'utf8');
  assert.match(arena,/aria-label="Poker table"/);
  assert.doesNotMatch(page,/TableAudio/);
  assert.match(page,/aria-label="Game controls" className="poker-controls/);
  assert.match(css,/\.poker-controls \{ position:static;/);
  assert.doesNotMatch(page,/sm:sticky/);
  assert.match(view,/if\(silent&&\(!cached\|\|autoStarted.current===key\)\)return/);
  assert.ok(view.indexOf('if(silent&&')<view.indexOf('authorizeCardView(client,address,POKER_ADDRESS)'));
  assert.match(view,/stored.issuer.toLowerCase\(\)===address.toLowerCase\(\)/);
  assert.match(view,/stored.contracts.some/);
});

test('combines every 2–6 seat deal without exceeding per-call batch limits',()=>{
  const poker='0x'+'1'.repeat(40);
  for(let remaining=1;remaining<=17;remaining++){
    const calls=buildDealCalls(poker,5n,remaining);
    let total=0;
    for(const call of calls){assert.equal(call.target,poker);assert.equal(call.allowFailure,false);const decoded=decodeFunctionData({abi:shuffleAbi,data:call.callData});assert.equal(decoded.functionName,'advanceShuffle');assert.equal(decoded.args[0],5n);assert.ok(decoded.args[1]<=4);total+=decoded.args[1];}
    assert.equal(total,remaining);
  }
  assert.equal(DEAL_ROUTER.toLowerCase(),'0xca11bde05977b3631167028862be2a173976ca11');
  for(const bad of [0,18,-1,NaN,1.5])assert.throws(()=>buildDealCalls(poker,0n,bad));
});
test('open lobby excludes full, settled, and closed tables',()=>{
  assert.equal(isOpenTable(0,1,2),true);
  for(const phase of [1,2,3,4,5,6,7,8])assert.equal(isOpenTable(phase,1,2),false);
  assert.equal(isOpenTable(0,2,2),false);
});
test('timeout recovery protects all-in seats and unrevealed streets',()=>{
  assert.equal(recoveryAction(1,100,101,0,0),'abortStalledHand');
  assert.equal(recoveryAction(2,100,101,0,0),'forceTimeoutFold');
  assert.equal(recoveryAction(2,100,100,0,0),null);
  for(const state of [1,2,3,undefined])assert.equal(recoveryAction(2,100,101,state,0),null);
  for(const phase of [3,4,5]){assert.equal(recoveryAction(phase,100,101,0,0),null);assert.equal(recoveryAction(phase,100,101,0,5),'forceTimeoutFold');}
  for(const phase of [0,6,7,8])assert.equal(recoveryAction(phase,100,101,0,5),null);
});
test('card read deadlines release UI waits without retrying the operation',async()=>{
  assert.equal(await withDeadline(Promise.resolve(42),100),42);
  let resolve;const pending=new Promise(done=>{resolve=done;});
  await assert.rejects(withDeadline(pending,5),/Card view timeout/);
  resolve(99); // Late completion cannot change the already rejected UI result.
  await assert.rejects(withDeadline(Promise.reject(new Error('denied')),100),/denied/);
});
