import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('mascot supports tap and keyboard activation without receiving private game state',()=>{
  const source=readFileSync(new URL('../components/poker/poker-mascot.tsx',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const require=createRequire(import.meta.url),module={exports:{}};
  new Function('require','module','exports',code)(name=>name==='next/image'?{default:props=>React.createElement('img',props)}:require(name),module,module.exports);
  const html=renderToStaticMarkup(React.createElement(module.exports.PokerMascot));
  assert.match(html,/button type="button"/);
  assert.match(html,/Tap the card shark/);
  assert.match(html,/aria-live="polite"/);
  assert.match(source,/setReaction\(value=>\(value\+1\)%quips.length\)/);
  assert.doesNotMatch(source,/wagmi|cofhe|wallet|privateCards/);
  const arena=readFileSync(new URL('../components/poker/poker-arena.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(arena,/DealerHost|PokerMascot|ACE/);
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/prefers-reduced-motion:reduce\).*mascot-react/s);
});
