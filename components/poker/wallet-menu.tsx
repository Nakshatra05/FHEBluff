'use client';
import {useState} from 'react';
import {Copy,LogOut,UserRound,WalletCards} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';

export function WalletMenu({address,profile,logout}:{address?:string;profile:()=>void;logout:()=>void}){
  const [message,setMessage]=useState('');
  const copy=async()=>{if(!address)return;try{await navigator.clipboard.writeText(address);setMessage('Address copied');}catch{setMessage('Copy unavailable. Your address is shown in your profile.');}};
  return <div className="relative"><DropdownMenu><DropdownMenuTrigger render={<button aria-label="Open wallet menu" className="brutal-button bg-purple px-3 py-2 text-base text-white"><WalletCards size={16}/>{address?`${address.slice(0,6)}…${address.slice(-4)}`:'Wallet'}</button>}/><DropdownMenuContent align="end" className="w-60 border-2 border-ink bg-cream p-2 shadow-hard"><DropdownMenuItem onClick={profile} className="min-h-11"><UserRound/>My profile & Credits</DropdownMenuItem><DropdownMenuItem disabled={!address} onClick={()=>void copy()} className="min-h-11"><Copy/>Copy wallet address</DropdownMenuItem><DropdownMenuItem onClick={logout} className="min-h-11 text-red-700"><LogOut/>Log out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>{message&&<output className="absolute right-0 top-full z-50 mt-2 w-60 border-2 border-ink bg-white p-2 text-sm shadow-hard">{message}<button aria-label="Dismiss clipboard message" onClick={()=>setMessage('')} className="ml-2 min-h-8 px-2 font-bold">×</button></output>}</div>;
}
