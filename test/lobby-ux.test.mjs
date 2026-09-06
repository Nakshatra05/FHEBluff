import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/poker/play-launchpad.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports);
const render=(props={})=>renderToStaticMarkup(React.createElement(module.exports.PlayLaunchpad,{practice:()=>{},quickSeat:()=>{},loading:false,hasSeat:false,...props}));
test('new players get two immediate choices and an optional guide',()=>{
  const html=render();assert.equal((html.match(/<button/g)||[]).length,2);
  assert.match(html,/Practice a hand/);assert.match(html,/Play with friends/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
  assert.match(html,/practice does not/);
});
test('waiting players and tied competition rank are represented honestly',()=>{
  assert.match(render({hasSeat:true}),/Find me a seat/);
  assert.match(render({address:'0x123',credits:2n,totals:[5n,2n,2n]}),/rank #2/);
  assert.doesNotMatch(render({address:'0x123',credits:0n,totals:[]}),/rank #1/);
});
test('wallet header opens a menu instead of logging out immediately',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const menu=readFileSync(new URL('../components/poker/wallet-menu.tsx',import.meta.url),'utf8');
  assert.match(page,/<WalletMenu/);assert.match(menu,/Open wallet menu/);
  assert.match(menu,/Copy wallet address/);assert.match(menu,/My profile &amp; Credits|My profile & Credits/);
  assert.doesNotMatch(page,/<button onClick=\{\(\)=>logout\(\)\}/);
});
