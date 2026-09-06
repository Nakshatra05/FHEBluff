type Props={stage:string;elapsed:number;message:string;busy:boolean;onRetry:()=>void;onStop:()=>void;disabled:boolean;protectedDeal?:boolean};
export function CardPreparation({stage,elapsed,message,busy,onRetry,onStop,disabled,protectedDeal=false}:Props){
  if(stage==='ready')return null;
  const retry=stage==='error'||(stage==='idle'&&!!message);
  return <div className="card-preparation border-2 border-ink bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className="text-base font-black text-purple">{retry?'Card access needs attention':stage==='authorizing'?'Approve private card access':'Your cards are arriving'}{busy&&<span aria-hidden="true" className="ml-2 font-mono text-sm">{elapsed}s</span>}</p>{stage==='decrypting'&&<button onClick={onStop} className="min-h-11 px-2 text-sm font-bold underline">Stop waiting</button>}</div>
    <p className="mt-1 text-sm leading-relaxed">{retry?message:stage==='authorizing'?'Your wallet may ask for a gas-free permission signature. It only authorizes access to your own cards.':'Cards appear automatically as CoFHE finishes. There’s no Show cards button to press.'}</p>
    {retry&&<button disabled={disabled} onClick={onRetry} className="brutal-button mt-3 min-h-12 bg-acid px-4 py-2 disabled:opacity-50">RETRY CARD ACCESS</button>}
    {protectedDeal?<p className="mt-2 border-l-4 border-green pl-2 text-sm font-bold">Betting has not started. Your chips stay untouched while both players prepare.</p>:busy&&elapsed>=20&&<p className="mt-2 border-l-4 border-pink pl-2 text-sm font-bold">This table’s betting clock is not paused by card loading. The readiness-protected contract is not active here yet.</p>}
  </div>;
}
