import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=readFileSync(new URL('../components/poker/hand-result.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
const require=createRequire(import.meta.url);
function loadComponent(file){const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const loaded={exports:{}};new Function('require','module','exports',code)(name=>name==='./poker-arena'?loadComponent('../components/poker/poker-arena.tsx'):name==='@/lib/practice-poker'?require('../lib/practice-poker.ts'):require(name),loaded,loaded.exports);return loaded.exports;}
new Function('require','module','exports',compiled)(name=>name==='./showdown-recap'?loadComponent('../components/poker/showdown-recap.tsx'):require(name),module,module.exports);
const result={handId:2n,winners:['0xABC'],pot:1500n,transactionHash:'0x123',method:'settleShowdown'};
const render=(props={})=>renderToStaticMarkup(React.createElement(module.exports.HandResultPanel,{handId:2n,result,address:'0xabc',seated:true,folded:false,onLobby:()=>{},...props}));
test('confirmed winner receives a prominent win and one Credit',()=>{const html=render();assert.match(html,/YOU WON!/);assert.match(html,/\+1 CREDIT/);assert.match(html,/BACK TO LOBBY/);assert.match(html,/View settlement receipt/);});
test('loss and fold explanation never invent hand ranks',()=>{const html=render({address:'0xdef',folded:true});assert.match(html,/YOU LOST THIS HAND/);assert.match(html,/You folded/);assert.match(html,/0 CREDITS/);assert.doesNotMatch(html,/flush|straight/);});
test('side pot winners are not mislabeled as a tied hand or individual payout',()=>{const html=render({result:{...result,winners:['0xABC','0xDEF']}});assert.match(html,/YOU WON A POT!/);assert.match(html,/side-pot winners/);assert.match(html,/not each winner/);});
test('missing and stale results cannot announce a winner or show old receipts',()=>{for(const stale of [null,{...result,handId:1n}]){const html=render({result:stale});assert.match(html,/Loading its verified result/);assert.doesNotMatch(html,/YOU WON|YOU LOST|View settlement receipt/);}});
test('spectator receives neutral result and uncontested explanation',()=>{const html=render({address:undefined,seated:false,result:{...result,method:'forceTimeoutFold'}});assert.match(html,/HAND COMPLETE/);assert.match(html,/All other players folded/);assert.doesNotMatch(html,/YOU LOST|YOUR CREDITS/);});

test('final scene shows public cards and category but leaves folded cards hidden',()=>{
  const html=render({result:{...result,recap:{board:[0,1,2,3,4],seats:[{player:'0xABC',folded:false,cards:[12,25]},{player:'0xDEF',folded:true}]}}});
  assert.match(html,/THE FINAL TABLE/);
  assert.match(html,/A♣/);
  assert.match(html,/Folded · cards stay private/);
  assert.match(html,/POT WINNER/);
});

test('settled games render only the result, independently of activity and metadata',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const terminal=page.slice(page.indexOf('if(phase===7)return'),page.indexOf('return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#191917]'));
  assert.match(terminal,/HandResultPanel/);
  assert.doesNotMatch(terminal,/WAITING FOR HOST|LEAVE TABLE|PokerArena|Game controls/);
  assert.ok(page.indexOf('setLastResult({...result,...metadata.get')<page.indexOf('const tx=await publicClient.getTransaction'));
  assert.match(page,/visibilitychange/);
  assert.match(page,/args:\{tableId:id,handId:resultHandId\}/);
  assert.doesNotMatch(render(),/Table options are below/);
});

test('card handles load alongside permission and individual cards are shown as they finish',()=>{
  const hook=readFileSync(new URL('../components/poker/use-private-cards.ts',import.meta.url),'utf8');
  assert.ok(hook.indexOf('const handlesPromise=')<hook.indexOf('await withDeadline(client.connect'));
  assert.match(hook,/available\[index\]=card/);
  assert.match(hook,/cards:\[\.\.\.cards\]/);
  assert.match(hook,/if\(current\(\)\)/);
});
