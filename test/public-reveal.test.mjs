import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public preparation is automatic, scoped to authorized street, and never signs or publishes',()=>{
  const hook=readFileSync(new URL('../components/poker/use-public-reveal.ts',import.meta.url),'utf8');
  assert.match(hook,/useEffect/);
  assert.match(hook,/getShowdownHandles':'getCommunityHandles/);
  assert.match(hook,/withoutACP\(\)/);
  assert.match(hook,/Promise.all\(handles.map/);
  assert.match(hook,/cache.get\(handle\)/);
  assert.match(hook,/active&&cycleActive/);
  assert.doesNotMatch(hook,/writeContract|signTypedData|getMyHoleCards|localStorage|console\./);
});
test('clicking reveal uses precomputed proofs and cannot start another decrypt wait',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const action=page.slice(page.indexOf('const publishReveal='),page.indexOf('if(phase===7)return'));
  assert.match(action,/if\(!publicReveal.ready\)return/);
  assert.match(action,/publicReveal.proofs.map/);
  assert.doesNotMatch(action,/decryptForTx|connectCofhe/);
});
