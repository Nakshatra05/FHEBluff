import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {tableLabel} from '../lib/table-label.ts';
const source=readFileSync(new URL('../components/poker/ready-to-play.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),module,module.exports);
const render=props=>renderToStaticMarkup(React.createElement(module.exports.ReadyToPlay,{cardsVisible:false,acknowledged:false,busy:false,expired:false,seconds:120,onReady:()=>{},onClose:()=>{},...props}));
test('early start is enabled without visible cards and explains consequences',()=>{
  const html=render({});assert.match(html,/PLAY WHILE CARDS LOAD/);assert.doesNotMatch(html,/disabled=""/);
  assert.match(html,/commits your blinds and starts the turn clock/);assert.match(html,/wait to see them first/);
});
test('pending, acknowledged and expired starts cannot submit a duplicate readiness',()=>{
  for(const props of [{busy:true},{acknowledged:true}])assert.match(render(props),/disabled=""/);
  assert.doesNotMatch(render({expired:true}),/PLAY WHILE CARDS LOAD/);
  assert.match(render({expired:true}),/NO CHIPS LOST/);
  assert.match(render({cardsVisible:true}),/LET’S PLAY/);
});
test('display IDs are stable and unique across deployments including large IDs',()=>{
  assert.equal(tableLabel(0n,'legacy'),'CLUB-001');assert.equal(tableLabel(0n),'SPADE-001');
  const labels=['legacy','ready'].flatMap(version=>Array.from({length:1000},(_,i)=>tableLabel(BigInt(i),version)));
  assert.equal(new Set(labels).size,2000);
  assert.equal(tableLabel(999999999999999999n),'SPADE-1000000000000000000');
});
