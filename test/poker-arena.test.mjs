import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Compile the actual presentation component in memory; never ship fixture cards.
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/poker/poker-arena.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
const hostCode=ts.transpileModule(readFileSync(new URL('../components/poker/dealer-host.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const host={exports:{}};new Function('require','module','exports',hostCode)(require,host,host.exports);
new Function('require','module','exports',compiled)(name=>name==='./dealer-host'?host.exports:require(name),module,module.exports);
const {PokerArena,PlayingCard}=module.exports;
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('private card markup never reveals its supplied rank or suit',()=>{
  const html=render(PlayingCard,{value:38,hidden:true});
  assert.match(html,/Private card/);
  assert.doesNotMatch(html,/A♥|card-corner|card-face/);
});
test('unrevealed board is a slot and red revealed cards have correct identity',()=>{
  assert.match(render(PlayingCard,{}),/Unrevealed community card/);
  const html=render(PlayingCard,{value:25});
  assert.match(html,/A♦/);
  assert.match(html,/card-red/);
});
test('two to six seats fit two rows without inventing players or pots',()=>{
  for(const capacity of [2,4,6]){
    const html=render(PokerArena,{capacity,board:[],phase:'PREFLOP',status:'YOUR TURN',pot:15,seats:[{player:'0x1234567890000000000000000000000000001234',stack:495,bet:5,state:0,active:true,credits:2}]});
    assert.equal((html.match(/class="arena-seats"/g)||[]).length,2);
    assert.equal((html.match(/Open seat/g)||[]).length,capacity-1);
    assert.match(html,/495/);assert.match(html,/Bet 5/);assert.match(html,/2 CR/);
    assert.equal((html.match(/Unrevealed community card/g)||[]).length,5);
  }
});
