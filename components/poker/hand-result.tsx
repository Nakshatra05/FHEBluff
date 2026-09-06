'use client';

import {useEffect,useRef} from 'react';

type Result={handId:bigint;winners:readonly string[];pot:bigint;transactionHash:string;method?:string};
export function HandResultPanel({handId,result,address,seated,folded,onLobby}:{handId:bigint;result:Result|null;address?:string;seated:boolean;folded:boolean;onLobby:()=>void}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.scrollIntoView({block:'start',behavior:'instant'});},[handId]);
  const confirmed=result?.handId===handId?result:null;
  const won=!!address&&!!confirmed?.winners.some(w=>w.toLowerCase()===address.toLowerCase());
  const multiple=(confirmed?.winners.length??0)>1;
  const title=!confirmed?'HAND SETTLED':won?multiple?'YOU WON A POT!':'YOU WON!':seated?'YOU LOST THIS HAND':'HAND COMPLETE';
  const showdown=confirmed?.method==='settleShowdown';
  const uncontested=confirmed?.method==='act'||confirmed?.method==='forceTimeoutFold';
  const reason=!confirmed?'The hand is settled onchain. Loading its verified result…':seated&&!won&&folded?'You folded, so you were no longer eligible to win a pot. Your remaining stack stays yours.':uncontested?'All other players folded. The last remaining player wins without revealing their private cards.':showdown?multiple?'The contract compared the best five-card hands for each eligible pot. Multiple players received chips: this can mean tied hands or different side-pot winners.':'The contract compared the eligible five-card hands at showdown and awarded the pot to the winner. Kickers break ties within a hand category.':'The contract has awarded the pot and recorded the winners below. Detailed hand comparisons are not available in this result.';
  return <section aria-label="Hand result" className={`hand-result border-3 border-ink p-5 text-ink shadow-hard sm:p-7 ${won?'bg-acid':'bg-cream'}`}>
    <div aria-live="polite"><p className="font-mono text-sm font-black">HAND #{String(handId)} · SETTLED ONCHAIN</p><h2 ref={heading} className="mt-2 scroll-mt-24 font-heading text-4xl leading-none sm:text-6xl">{title}</h2><p className="mt-4 max-w-3xl text-base font-semibold leading-relaxed">{reason}</p></div>
    {confirmed&&<><div className="mt-5 flex flex-wrap gap-3"><div className="border-3 border-ink bg-white px-4 py-3"><p className="text-sm font-bold">TOTAL POT AWARDED</p><strong className="text-2xl">{confirmed.pot.toLocaleString()} CHIPS</strong></div>{(seated||won)&&<div className="border-3 border-ink bg-purple px-4 py-3 text-white"><p className="text-sm font-bold">YOUR CREDITS THIS HAND</p><strong className="text-2xl">{won?'+1 CREDIT':'0 CREDITS'}</strong></div>}</div><p className="mt-4 text-sm font-black">{multiple?'POT WINNERS · +1 CREDIT EACH':'WINNER · +1 CREDIT'}</p><ul className="mt-2 flex flex-wrap gap-2">{confirmed.winners.map(w=><li key={w} title={w} className="max-w-full break-all border-2 border-ink bg-white px-3 py-2 font-mono text-sm font-bold">{w.slice(0,6)}…{w.slice(-4)}{w.toLowerCase()===address?.toLowerCase()?' · YOU':''}</li>)}</ul>{multiple&&<p className="mt-2 text-sm">The total pot is not each winner’s payout. Individual shares are not included in the settlement event.</p>}</>}
    <div className="mt-5 flex flex-wrap gap-3"><button onClick={onLobby} className="brutal-button min-h-12 bg-pink px-6 py-3">BACK TO LOBBY</button>{confirmed&&<a href={`https://sepolia.arbiscan.io/tx/${confirmed.transactionHash}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center border-2 border-ink bg-white px-4 py-3 font-bold underline">View settlement receipt ↗</a>}</div><p className="mt-3 text-sm font-semibold">Returning to the lobby needs no signature and does not leave your seat. Table options are below.</p>
  </section>;
}
