'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Sparkles,Trophy} from 'lucide-react';
import {bestHand,cardLabel,HAND_NAMES,newPracticeHand,practiceMove,STREETS,type PracticeAction} from '@/lib/practice-poker';

export function PracticeTable({close,playRanked}:{close:()=>void;playRanked:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();return()=>{element?.close();document.body.style.overflow=overflow;};},[]);
  const [hand,setHand]=useState(()=>newPracticeHand());
  const [results,setResults]=useState({hands:0,wins:0,ties:0});
  const [showRanks,setShowRanks]=useState(false);
  const resultHeading=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(hand.finished)resultHeading.current?.scrollIntoView({block:'center',behavior:'instant'});},[hand.finished]);
  const action=(move:PracticeAction)=>{
    const next=practiceMove(hand,move);
    setHand(next);
    if(next.finished&&!hand.finished)setResults(old=>({hands:old.hands+1,wins:old.wins+(next.outcome==='win'?1:0),ties:old.ties+(next.outcome==='tie'?1:0)}));
  };
  return <dialog ref={dialog} onCancel={close} className="fixed inset-0 z-[60] m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-cream p-0 text-ink" aria-label="Practice poker">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-3 border-ink bg-acid px-4 py-3"><button onClick={close} className="flex min-h-11 items-center gap-2 font-black"><ArrowLeft className="size-5"/>Lobby</button><span className="font-mono text-sm font-black">PRACTICE · NO WALLET</span></header>
    <div className="mx-auto max-w-4xl space-y-4 px-3 py-5 pb-36 sm:px-6">
      <div><p className="eyebrow text-purple">LEARN BY PLAYING</p><h1 className="font-heading text-4xl sm:text-5xl">Your first poker rival.</h1><p className="mt-2 text-base font-semibold">A local computer opponent. Instant moves, coaching, and a fresh 500-chip stack each hand. Practice results do not earn Credits or affect the leaderboard.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-3 border-ink bg-white p-3 font-mono text-sm"><span>{results.hands} HANDS · {results.wins} WINS · {results.ties} TIES</span><button className="flex min-h-11 items-center gap-2 font-black text-purple" onClick={()=>setShowRanks(!showRanks)} aria-expanded={showRanks}><BookOpen className="size-4"/>Hand cheat sheet</button></div>
      {showRanks&&<div className="border-3 border-ink bg-white p-4"><p className="font-black">Strongest to weakest</p><ol className="mt-2 grid list-inside list-decimal gap-2 text-base sm:grid-cols-3">{[...HAND_NAMES].reverse().map(name=><li key={name}>{name}</li>)}</ol><p className="mt-3 text-base">Make the best five cards from your two cards and the five shared cards. You may use both, one, or neither of your own cards.</p></div>}
      <div className="grid grid-cols-3 gap-2 text-center">{[['Your stack',hand.stack],['Pot',hand.pot],['Computer stack',hand.botStack]].map(([label,value])=><div key={label} className="border-3 border-ink bg-white p-2"><span className="block text-xs font-bold">{label}</span><strong className="text-2xl">{value}</strong></div>)}</div>
      <div className="border-3 border-ink bg-[#0f714c] px-2 py-6 text-center text-white shadow-hard sm:px-5">
        <p className="font-mono text-sm text-acid">COMPUTER OPPONENT</p><div className="mt-2 flex justify-center gap-2">{hand.opponent.map((card,i)=><PracticeCard key={i} card={hand.finished?card:undefined}/>)}</div>
        <p className="mt-6 font-black uppercase">{hand.finished?'Hand complete':STREETS[hand.street]}</p>
        <div className="my-3 flex justify-center gap-1.5 sm:gap-3">{Array.from({length:5},(_,i)=><PracticeCard key={i} card={hand.board[i]}/>)}</div>
        <p className="mt-6 font-mono text-sm text-acid">YOUR CARDS</p><div className="mt-2 flex justify-center gap-2">{hand.hole.map(card=><PracticeCard key={card} card={card}/>)}</div>
        {hand.board.length>=3&&<p className="mt-3 text-base font-bold">Your best hand: {HAND_NAMES[bestHand([...hand.hole,...hand.board])[0]]}</p>}
      </div>
      <div ref={resultHeading} className={`border-3 border-ink p-5 shadow-hard ${hand.finished&&hand.outcome==='win'?'bg-acid':'bg-white'}`} aria-live="polite"><p className={hand.finished?'font-heading text-4xl sm:text-5xl':'flex items-center gap-2 font-black text-purple'}>{!hand.finished&&<Sparkles className="size-5"/>}{hand.finished?(hand.outcome==='win'?'YOU WON!':hand.outcome==='tie'?'SPLIT POT':'YOU LOST THIS HAND'):'Your next move'}</p><p className="mt-3 text-base leading-relaxed">{hand.explanation}</p>{hand.finished&&<><p className="mt-3 text-xl font-black">{hand.stack-500>=0?'+':''}{hand.stack-500} NET CHIPS · PRACTICE ONLY</p><button onClick={close} className="brutal-button mt-4 min-h-12 bg-pink px-5 py-3">BACK TO LOBBY</button></>}</div>
      {!hand.finished?<div className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-4xl grid-cols-3 gap-2 border-t-3 border-ink bg-cream px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <p className="col-span-3 text-center text-sm font-bold">{STREETS[hand.street]} · {hand.due?`${hand.due} chips to stay in`:'Checking is free'}</p>
        <button onClick={()=>action('fold')} className="border-3 border-ink bg-pink px-2 py-3 font-black shadow-hard-sm">Fold<span className="mt-1 block text-xs font-medium">Give up this hand</span></button>
        <button onClick={()=>action('continue')} className="border-3 border-ink bg-green px-2 py-3 font-black shadow-hard-sm">{hand.due?`Call ${hand.due}`:'Check'}<span className="mt-1 block text-xs font-medium">{hand.due?'Match their bet':'Stay in for free'}</span></button>
        <button onClick={()=>action('raise')} className="border-3 border-ink bg-acid px-2 py-3 font-black shadow-hard-sm">{hand.due?'Raise':'Bet'} {hand.due+(hand.street>=2?40:20)}<span className="mt-1 block text-xs font-medium">Put more chips in</span></button>
      </div>:<div className="grid gap-3 sm:grid-cols-2"><button onClick={()=>setHand(newPracticeHand())} className="brutal-button bg-acid px-3 py-4">Play another hand <ArrowRight className="size-4"/></button><button onClick={playRanked} className="brutal-button bg-purple px-3 py-4 text-white"><Trophy className="size-4"/>Find a multiplayer table</button></div>}
      <details className="border-2 border-ink bg-white p-3 text-base"><summary className="cursor-pointer font-black">What happened this hand?</summary><ol className="mt-2 space-y-1">{hand.log.map((line,i)=><li key={i}>{line}</li>)}</ol></details>
      <p className="pb-4 text-sm text-ink/65">Teaching rules: equal 10-chip antes, fixed 20/40-chip bets, one raise per round. Multiplayer uses blinds and custom raises. This practice game runs locally and does not use CoFHE encryption.</p>
    </div>
  </dialog>;
}
function PracticeCard({card}:{card?:number}){return <div className={`grid h-16 w-11 shrink-0 place-items-center border-2 border-ink text-lg font-black shadow-hard-sm sm:h-24 sm:w-16 sm:text-2xl ${card===undefined?'bg-purple text-acid':'card-pop bg-white '+(card>=13&&card<39?'text-red-600':'text-ink')}`}>{card===undefined?'♠':cardLabel(card)}</div>;}
