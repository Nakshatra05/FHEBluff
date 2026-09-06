'use client';
import {Gamepad2,Users,Trophy,BookOpen} from 'lucide-react';

export function PlayLaunchpad({practice,quickSeat,hasSeat,loading,address,credits,totals}:{practice:()=>void;quickSeat:()=>void;hasSeat:boolean;loading:boolean;address?:string;credits?:bigint;totals?:readonly bigint[]}) {
  const rank=credits!==undefined&&totals?totals.filter(total=>total>credits).length+1:undefined;
  return <section className="play-launchpad mb-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <button onClick={practice} className="launch-choice bg-ink text-white"><Gamepad2 className="size-7 text-acid"/><span><strong>Practice a hand</strong><small>Play a bot · no wallet · learn the moves</small></span><span aria-hidden="true">↗</span></button>
      <button disabled={loading} onClick={quickSeat} className="launch-choice bg-acid disabled:opacity-50"><Users className="size-7"/><span><strong>{loading?'Finding tables…':hasSeat?'Find me a seat':'Play with friends'}</strong><small>{hasSeat?'Open a table with players waiting':'Create a table and share your invite'}</small></span><span aria-hidden="true">↗</span></button>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"><span>Free play chips. Multiplayer needs test ETH for network fees.</span><span className="flex items-center gap-1"><Trophy size={14}/>{address&&credits!==undefined&&credits>0n?`${credits} Credits${rank?' · rank #'+rank:''}`:'Win a multiplayer hand → +1 Credit'}</span></div>
    <section className="mt-5 border-3 border-ink bg-white p-4 shadow-hard sm:p-5"><h2 className="mb-4 flex items-center gap-2 font-heading text-xl sm:text-2xl"><BookOpen size={16}/>New here? The 30-second guide</h2><div className="grid gap-4 pb-4 text-base sm:grid-cols-3"><p><strong className="block">1. Get your cards</strong>Join with free chips. Ready the private deal, then unlock your two cards. Only you can view them.</p><p><strong className="block">2. Make your move</strong>Check costs nothing. Call matches the bet. Raise adds pressure. Fold leaves this hand, not the table.</p><p><strong className="block">3. Win the pot</strong>Make the best five-card hand, or be the last player who has not folded. Verified multiplayer winners earn +1 Credit; practice does not.</p></div></section>
  </section>;
}
