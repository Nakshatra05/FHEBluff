import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('one history fetches both deployments without presenting a version switch',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  assert.match(page,/Object.entries\(deployments\)/);
  assert.match(page,/fromBlock:deployment.block/);
  assert.match(page,/setHandHistory\(histories.flat\(\).sort/);
  assert.doesNotMatch(page,/Old tables & Credits|LEGACY TABLES · betting timers/);
  const history=readFileSync(new URL('../components/poker/hand-history.tsx',import.meta.url),'utf8');
  assert.match(history,/onOpen\(hand.tableId,hand.version\)/);
  assert.doesNotMatch(history,/OPEN \/ REMATCH/);
});
test('card permission is prepared after the contribution and reused by later card access',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const start=page.indexOf('const prepareEncryptedCards');
  const end=page.indexOf('const publishReveal',start);
  const flow=page.slice(start,end);
  assert.ok(flow.indexOf("functionName:'submitEntropy'")<flow.indexOf('await authorizeCardView('));
  const client=readFileSync(new URL('../lib/cofhe-client.ts',import.meta.url),'utf8');
  assert.match(client,/ValidationUtils.isValid\(stored\).valid\)return Promise.resolve\(stored\)/);
});
