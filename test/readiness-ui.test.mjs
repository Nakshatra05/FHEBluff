import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeCredits} from '../lib/credits-board.ts';
import {recoveryAction} from '../lib/table-lifecycle.ts';
import {cardViewError} from '../lib/card-view-error.ts';

test('card errors distinguish permissions from ciphertext availability without dumping secrets',()=>{
  assert.match(cardViewError({code:'ACP_DENIED',message:'secret'}),/permission/);
  assert.match(cardViewError({code:'CT_NOT_FOUND',message:'secret'}),/encrypted deal/);
  assert.doesNotMatch(cardViewError(new Error('private secret')),/private secret/);
});

test('zero Credit connected wallet appears and genuine Credits combine without case duplicates',()=>{
  const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
  assert.deepEqual(mergeCredits([[[a],[2n]],[[a.toUpperCase()],[3n]]],b,0n),[[a,b],[5n,0n]]);
  assert.deepEqual(mergeCredits([[[a],[2n]]],a,2n),[[a],[2n]]);
});
test('preparation expiry never offers a timeout fold',()=>{
  assert.equal(recoveryAction(9,100,99,0,0),null);
  assert.equal(recoveryAction(9,100,101,0,0),'abortStalledHand');
});
test('new deployment is explicit and old unversioned invitations remain legacy',()=>{
  const source=readFileSync(new URL('../lib/poker-deployment.tsx',import.meta.url),'utf8');
  const body=source.match(/export function resolveDeployment\(search:string\):DeploymentVersion\{([\s\S]*?)\n\}/)[1];
  const resolve=new Function('search',body);
  assert.equal(resolve(''),'flow');
  assert.equal(resolve('?table=8'),'legacy');
  assert.equal(resolve('?table=8&version=ready'),'ready');
  assert.equal(resolve('?version=legacy'),'flow');
  assert.equal(resolve('?table=0&version=flow'),'flow');
  assert.equal(resolve('?table=0&version=instant'),'instant');
});
test('readiness permits explicit early opt-in and permission cache includes deployment',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  assert.match(page,/onReady=\{\(\)=>\{if\(table\)transact\('confirmCardsReady',\[id,table\[6\]\]\)/);
  assert.match(page,/const isMyTurn=phase>=2&&phase<=5/);
  assert.match(page,/url.searchParams.set\('version',version\)/);
  const client=readFileSync(new URL('../lib/cofhe-client.ts',import.meta.url),'utf8');
  assert.match(client,/contract.toLowerCase\(\)/);
  assert.match(client,/createSelf\(\{issuer:account,contracts:\[contract\]/);
});
