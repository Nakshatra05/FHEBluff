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
test('dense UI metadata does not fall below the 12px type floor',()=>{
  for(const file of ['app/play/page.tsx','components/poker/table-guide.tsx','components/poker/hand-history.tsx','components/poker/practice-table.tsx']){
    const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(text,/text-\[(?:[7-9]|10|11)px\]/);
  }
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  for(const match of css.matchAll(/font-size:(\d+)px/g))assert.ok(Number(match[1])>=12);
  assert.match(css,/\.brutal-button \{ min-height:48px; border-radius:0;/);
  assert.match(css,/\.poker-felt \{ grid-template-columns:minmax\(0,1fr\);/);
});
test('new players get two immediate choices and an always-visible guide',()=>{
  const html=render();assert.equal((html.match(/<button/g)||[]).length,2);
  assert.match(html,/Practice a hand/);assert.match(html,/Play with friends/);
  assert.doesNotMatch(html,/<details|<summary/);
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
test('app-owned overlays and selected table presets share the theme',()=>{
  const page=readFileSync(new URL('../app/play/page.tsx',import.meta.url),'utf8');
  const menu=readFileSync(new URL('../components/poker/wallet-menu.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(page,/<DialogContent className="neo-dialog/);
  assert.match(menu,/className="neo-menu/);
  assert.match(page,/aria-pressed=\{maxPlayers===preset.players/);
  assert.match(page,/Full wallet address/);
  assert.match(css,/\.neo-dialog \{ border-radius:0/);
  assert.match(css,/\.neo-menu \{ border-radius:0/);
});
