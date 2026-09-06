'use client';
import {useState} from 'react';

export function BettingControls({stack,bet,currentBet,pot,bigBlind,onMove}:{stack:number;bet:number;currentBet:number;pot:number;bigBlind:number;onMove:(action:number,amount?:bigint)=>void}) {
  const [custom,setCustom]=useState('');
  const due=Math.max(0,currentBet-bet);const cost=Math.min(stack,due);
  const max=stack+bet;const min=currentBet+1; // Mirrors the currently deployed contract's raise rule.
  const defaultRaise=Math.min(max,currentBet+bigBlind);
  const raise=custom===''?defaultRaise:Number(custom);
  const valid=Number.isSafeInteger(raise)&&raise>=min&&raise<=max;
  const canRaise=Number.isSafeInteger(max)&&max>currentBet;
  return <div className="betting-controls space-y-2">
    <div className="grid grid-cols-2 gap-2"><button onClick={()=>onMove(0)} className="min-h-11 border-2 border-ink bg-pink px-3 font-black">Fold</button><button onClick={()=>onMove(due===0?1:2)} className="min-h-11 border-2 border-ink bg-green px-3 font-black">{due===0?'Check · free':`Call ${cost}${cost===stack?' · all-in':''}`}</button></div>
    <details className="border-2 border-ink bg-white p-3"><summary className="min-h-9 cursor-pointer font-black">Bet more · raise / all-in</summary><div className="mt-2 space-y-3">{canRaise&&<><p className="text-sm">Choose your total bet for this round. You have already put in {bet} chips.</p><div className="grid grid-cols-3 gap-2">{[['Small',currentBet+bigBlind],['½ pot',currentBet+Math.max(bigBlind,Math.ceil(pot/2))],['Pot',currentBet+Math.max(bigBlind,pot)]].map(([label,value])=><button key={label} onClick={()=>setCustom(String(Math.min(max,Number(value))))} className="min-h-11 border-2 border-ink bg-cream text-sm font-bold">{label} · {Math.min(max,Number(value))}</button>)}</div><label className="block text-sm font-bold">Raise to<input type="number" inputMode="numeric" min={min} max={max} step="1" value={custom===''?defaultRaise:custom} onChange={e=>setCustom(e.target.value)} className="input-brutal mt-1"/></label>{!valid&&<p role="alert" className="text-sm text-red-700">Choose a whole number from {min} to {max}.</p>}<button disabled={!valid} onClick={()=>onMove(3,BigInt(raise))} className="brutal-button w-full bg-acid py-3 disabled:opacity-40">Raise to {valid?raise:'…'} · pay {valid?raise-bet:'…'}</button></>}<button disabled={stack<=0} onClick={()=>onMove(4)} className="brutal-button w-full bg-purple py-3 text-white disabled:opacity-40">All-in · commit all {stack} chips</button></div></details>
  </div>;
}
