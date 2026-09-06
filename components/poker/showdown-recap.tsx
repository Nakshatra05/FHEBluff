import {PlayingCard} from './poker-arena';
import {bestHand,HAND_NAMES} from '@/lib/practice-poker';
import type {PublicHandRecap} from '@/lib/public-hand-recap';

export function ShowdownRecap({recap,winners}:{recap:PublicHandRecap;winners:readonly string[]}){
  return <section className="mt-5 border-3 border-ink bg-[#164d43] p-4 text-white sm:p-6" aria-label="Final table">
    <h3 className="font-heading text-2xl">THE FINAL TABLE</h3>
    <div className="community-cards showdown-board my-4">{Array.from({length:5},(_,i)=><PlayingCard key={i} value={recap.board[i]}/>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">{recap.seats.map(seat=>{
      const winner=winners.some(player=>player.toLowerCase()===seat.player.toLowerCase());
      return <article key={seat.player} className={`border-3 border-ink p-3 text-ink ${winner?'bg-acid':'bg-cream'}`}>
        <p className="break-all font-mono text-sm font-bold">{seat.player.slice(0,6)}…{seat.player.slice(-4)}{winner?' · POT WINNER':''}</p>
        <div className="my-3 flex gap-2"><PlayingCard value={seat.cards?.[0]} hidden={!seat.cards}/><PlayingCard value={seat.cards?.[1]} hidden={!seat.cards}/></div>
        <p className="font-bold">{seat.cards?HAND_NAMES[bestHand([...seat.cards,...recap.board])[0]]:seat.folded?'Folded · cards stay private':'Cards not publicly revealed'}</p>
      </article>;
    })}</div>
    <p className="mt-3 text-sm">Only publicly revealed showdown cards are shown. Unrevealed and folded hands stay private.</p>
  </section>;
}
