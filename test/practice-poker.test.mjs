import test from 'node:test';
import assert from 'node:assert/strict';
import {bestHand,compareScores,newPracticeHand,practiceMove} from '../lib/practice-poker.ts';

const cards = text => text.split(' ').map(card=>'CDHS'.indexOf(card.at(-1))*13+'23456789TJQKA'.indexOf(card[0]));
const seeded = seed => () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

test('evaluates all categories, including a wheel and two possible full houses',()=>{
  for(const [hand,category] of [
    ['AC JC 9C 5C 2C',5],['AS KH 9C 6D 2H',0],['AS AH 9C 6D 2H',1],
    ['AS AH 9C 9D 2H',2],['AS AH AC 6D 2H',3],['AS 2H 3C 4D 5H',4],
    ['AS AH AC 6D 6H',6],['AS AH AC AD 2H',7],['9S TS JS QS KS',8],
  ])assert.equal(bestHand(cards(hand))[0],category,hand);
  assert.deepEqual(bestHand(cards('AS AH AC KS KH KC 2D')),[6,14,13]);
  assert.equal(compareScores(bestHand(cards('AS 2H 3C 4D 5H')),bestHand(cards('2S 3H 4C 5D 6H'))),-1);
});
test('uses kickers, allows playing the board, and rejects impossible card inputs',()=>{
  assert.equal(compareScores(bestHand(cards('AS AH KC 9D 2H')),bestHand(cards('AD AC QH JS 9H'))),1);
  const board=cards('TS JS QS KS AS');
  assert.equal(compareScores(bestHand([...board,...cards('2C 3D')]),bestHand([...board,...cards('AH AD')])),0);
  assert.throws(()=>bestHand([0,0,1,2,3]));assert.throws(()=>bestHand([0,1,2,3,52]));
});
test('1000 complete teaching hands deal unique cards and conserve chips',()=>{
  for(let seed=1;seed<=1000;seed++){
    const random=seeded(seed);let hand=newPracticeHand(random);let moves=0;
    while(!hand.finished){
      assert.equal(hand.stack+hand.botStack+hand.pot,1000);
      assert.equal(new Set([...hand.hole,...hand.opponent,...hand.board,...hand.deck]).size,52);
      const action=seed%7===0?'fold':seed%3===0?'raise':'continue';
      hand=practiceMove(hand,action,random);moves++;
      assert.ok(moves<=4);assert.ok(hand.stack>=0&&hand.botStack>=0);
    }
    assert.equal(hand.stack+hand.botStack,1000);
    assert.equal(practiceMove(hand,'raise'),hand,'finished hands cannot settle twice');
  }
});
test('computer reaction does not depend on the player’s hidden hole cards',()=>{
  const hand=newPracticeHand(seeded(40));
  const changed={...hand,hole:hand.deck.slice(-2)};
  const first=practiceMove(hand,'raise',seeded(3));const second=practiceMove(changed,'raise',seeded(3));
  assert.deepEqual(first.log,second.log);assert.equal(first.due,second.due);assert.equal(first.finished,second.finished);
});
