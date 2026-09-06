import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {shouldAutoStartCards} from '../lib/card-auto-start.ts';
const source=readFileSync(new URL('../components/poker/card-preparation.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};new Function('require','module','exports',code)(createRequire(import.meta.url),module,module.exports);
const render=props=>renderToStaticMarkup(React.createElement(module.exports.CardPreparation,{stage:'idle',elapsed:0,message:'',busy:false,onRetry:()=>{},onStop:()=>{},disabled:false,...props}));
test('auto-start attempts once per eligible visible hand/wallet, never in background',()=>{
  assert.equal(shouldAutoStartCards(true,true,'hand:a',''),true);
  assert.equal(shouldAutoStartCards(true,true,'hand:a','hand:a'),false);
  assert.equal(shouldAutoStartCards(true,false,'hand:b','hand:a'),false);
  assert.equal(shouldAutoStartCards(false,true,'hand:b','hand:a'),false);
  assert.equal(shouldAutoStartCards(true,true,'hand:b','hand:a'),true);
});
test('normal preparation has no required button and success removes the preparation panel',()=>{
  assert.doesNotMatch(render({}),/<button/);
  assert.equal(render({stage:'ready'}),'');
  assert.match(render({stage:'authorizing',busy:true}),/permission signature/);
  assert.doesNotMatch(render({stage:'authorizing',busy:true}),/<button/);
});

test('protected deals explicitly keep chips and betting clock out of preparation',()=>{
  const html=render({stage:'decrypting',busy:true,elapsed:90,protectedDeal:true});
  assert.match(html,/Betting has not started/);
  assert.doesNotMatch(html,/betting clock is not paused/);
});
test('only failed or stopped access exposes retry; slow legacy waits disclose active clock',()=>{
  assert.match(render({stage:'error',message:'Try again'}),/RETRY CARD ACCESS/);
  assert.match(render({stage:'idle',message:'Stopped'}),/RETRY CARD ACCESS/);
  assert.match(render({stage:'decrypting',busy:true,elapsed:25}),/betting clock is not paused/);
  assert.doesNotMatch(render({stage:'decrypting',busy:true}),/RETRY CARD ACCESS/);
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/\.deal-motion \.card-back\{animation:none\}/);
});
