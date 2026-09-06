'use client';

import {useEffect} from 'react';
import {CheckCircle2,Info,LoaderCircle,X} from 'lucide-react';
import type {TransactionFeedback} from '@/lib/transaction-feedback';

export function TransactionNotice({notice,onDismiss,inline=false}:{notice:TransactionFeedback;onDismiss:()=>void;inline?:boolean}) {
  useEffect(()=>{
    // Only success messages disappear automatically. Actionable errors and
    // uncertain submissions remain available until the player dismisses them.
    if(notice.kind!=='success')return;
    const timer=setTimeout(onDismiss,5000);return()=>clearTimeout(timer);
  },[notice,onDismiss]);
  const Icon=notice.kind==='pending'?LoaderCircle:notice.kind==='success'?CheckCircle2:Info;
  return <aside aria-label="Transaction update" className={`border-3 border-ink bg-cream p-3 text-ink shadow-hard ${inline?'relative w-full':'fixed inset-x-3 top-24 z-[80] mx-auto max-w-sm sm:inset-x-auto sm:right-4 sm:top-24 sm:w-80'}`}>
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className={`mt-1 size-5 shrink-0 ${notice.kind==='pending'?'animate-spin text-purple':notice.kind==='success'?'text-emerald-700':'text-purple'}`}/>
      <div className="min-w-0 flex-1"><output aria-live="polite" className="block"><strong className="block text-sm">{notice.title}</strong><span className="mt-1 block break-words text-xs leading-relaxed">{notice.message}</span></output>{notice.hash&&<a className="mt-2 inline-flex min-h-11 items-center text-xs font-bold underline" href={`https://sepolia.arbiscan.io/tx/${notice.hash}`} target="_blank" rel="noreferrer">Check transaction status</a>}</div>
      <button onClick={onDismiss} className="grid size-11 shrink-0 place-items-center border-2 border-ink bg-white" aria-label="Dismiss transaction message"><X className="size-4"/></button>
    </div>
  </aside>;
}
