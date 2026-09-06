// Local, unranked teaching game. This engine never reads or writes live poker state.
export type PracticeAction = 'fold' | 'continue' | 'raise';
export type PracticeHand = {
  deck: number[]; street: number; board: number[]; hole: number[]; opponent: number[];
  pot: number; stack: number; botStack: number; due: number;
  finished: boolean; outcome?: 'win' | 'loss' | 'tie'; explanation: string; log: string[];
};
export const HAND_NAMES = ['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
export const STREETS = ['Preflop','Flop','Turn','River'];

function fiveCardScore(cards: number[]): number[] {
  const ranks = cards.map(card => card % 13 + 2).sort((a,b) => b-a);
  const counts = new Map<number,number>();
  for (const rank of ranks) counts.set(rank,(counts.get(rank)||0)+1);
  const groups = [...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush = cards.every(card=>Math.floor(card/13)===Math.floor(cards[0]/13));
  const unique = [...new Set(ranks)];
  const straight = unique.length===5 ? (unique[0]-unique[4]===4 ? unique[0] : unique.join(',')==='14,5,4,3,2' ? 5 : 0) : 0;
  if(flush&&straight) return [8,straight];
  if(groups[0][1]===4) return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2) return [6,groups[0][0],groups[1][0]];
  if(flush) return [5,...ranks];
  if(straight) return [4,straight];
  if(groups[0][1]===3) return [3,groups[0][0],...groups.slice(1).map(group=>group[0])];
  if(groups[0][1]===2&&groups[1][1]===2) return [2,...groups.map(group=>group[0])];
  if(groups[0][1]===2) return [1,...groups.map(group=>group[0])];
  return [0,...ranks];
}
export function compareScores(a:number[],b:number[]):number {
  for(let i=0;i<Math.max(a.length,b.length);i++) {const diff=(a[i]||0)-(b[i]||0);if(diff)return Math.sign(diff);}
  return 0;
}
export function bestHand(cards:number[]):number[] {
  if(cards.length<5||cards.length>7||new Set(cards).size!==cards.length||cards.some(c=>!Number.isInteger(c)||c<0||c>51)) throw new Error('Expected 5 to 7 unique cards');
  let best:number[]=[];
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
    const score=fiveCardScore([cards[a],cards[b],cards[c],cards[d],cards[e]]);
    if(compareScores(score,best)>0)best=score;
  }
  return best;
}
export function cardLabel(card:number):string {return `${['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13]}${['♣','♦','♥','♠'][Math.floor(card/13)]}`;}

// The computer uses only its own cards and the public board, never the player's cards.
function strength(hole:number[],board:number[]):number {
  if(board.length>=3)return bestHand([...hole,...board])[0];
  return hole[0]%13===hole[1]%13 ? 2 : Math.max(...hole.map(c=>c%13))>=10 ? 1 : 0;
}
function botOpening(hand:PracticeHand,random:()=>number):PracticeHand {
  const amount=hand.street>=2?40:20;
  const wantsBet=random()<(strength(hand.opponent,hand.board)>=1?.65:.25);
  if(!wantsBet)return {...hand,due:0,explanation:'The computer checks. You can check for free or bet to build the pot.',log:[...hand.log,`${STREETS[hand.street]}: computer checks.`]};
  return {...hand,due:amount,botStack:hand.botStack-amount,pot:hand.pot+amount,explanation:`The computer bets ${amount}. Call to match it, raise to make it pay more, or fold to save your remaining chips.`,log:[...hand.log,`${STREETS[hand.street]}: computer bets ${amount}.`]};
}
export function newPracticeHand(random:()=>number=Math.random):PracticeHand {
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  // Teaching mode: equal 10-chip antes, fixed bet sizes, one raise per street.
  const hand:PracticeHand={deck:deck.slice(4),hole:deck.slice(0,2),opponent:deck.slice(2,4),board:[],street:0,pot:20,stack:490,botStack:490,due:0,finished:false,explanation:'',log:['Both players put in a 10-chip ante.']};
  return botOpening(hand,random);
}
function finish(hand:PracticeHand,outcome:'win'|'loss'|'tie',explanation:string):PracticeHand {
  const share=outcome==='win'?hand.pot:outcome==='tie'?hand.pot/2:0;
  return {...hand,finished:true,due:0,outcome,stack:hand.stack+share,botStack:hand.botStack+hand.pot-share,explanation};
}
export function practiceMove(current:PracticeHand,action:PracticeAction,random:()=>number=Math.random):PracticeHand {
  if(current.finished) return current;
  if(action==='fold')return finish({...current,log:[...current.log,'You folded.']},'loss','You folded and saved your remaining stack. Folding is a normal part of poker; you do not need to win every hand.');
  const raiseSize=current.street>=2?40:20;
  const extra=action==='raise'?raiseSize:0;
  const paid=current.due+extra;
  let hand={...current,stack:current.stack-paid,pot:current.pot+paid,due:0,log:[...current.log,action==='raise'?`You ${current.due?'raise':'bet'} ${paid}.`:current.due?`You call ${paid}.`:'You check.']};
  if(extra){
    const folds=random()<(strength(hand.opponent,hand.board)===0?.35:.08);
    if(folds)return finish({...hand,log:[...hand.log,'Computer folds.']},'win','The computer folded. You win the pot without showing your cards. A bet can win even without the strongest hand.');
    hand={...hand,botStack:hand.botStack-extra,pot:hand.pot+extra,log:[...hand.log,`Computer calls ${extra}.`]};
  }
  if(hand.street===3){
    const yours=bestHand([...hand.hole,...hand.board]);const theirs=bestHand([...hand.opponent,...hand.board]);const comparison=compareScores(yours,theirs);
    return finish(hand,comparison>0?'win':comparison<0?'loss':'tie',`Your ${HAND_NAMES[yours[0]].toLowerCase()} vs their ${HAND_NAMES[theirs[0]].toLowerCase()}. ${comparison===0?'The best five cards tie, so you split the pot.':'The best five-card hand wins; kickers break ties within a category.'}`);
  }
  const count=hand.street===0?3:1;
  return botOpening({...hand,street:hand.street+1,board:[...hand.board,...hand.deck.slice(0,count)],deck:hand.deck.slice(count)},random);
}
