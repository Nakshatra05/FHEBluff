'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {usePublicClient,useWalletClient} from 'wagmi';
import {FheTypes} from '@cofhe/sdk';
import {ValidationUtils} from '@cofhe/sdk/acps';
import {authorizeCardView,createCardViewClient} from '@/lib/cofhe-client';
import {POKER_ADDRESS,ARBITRUM_SEPOLIA_CHAIN_ID} from '@/lib/network';
import {fheBluffAbi} from '@/lib/fhebluff-abi';
import {withDeadline} from '@/lib/async-deadline';

type ViewState={key:string;stage:'idle'|'authorizing'|'decrypting'|'ready'|'error';message:string;cards:number[];started:number};
export function usePrivateCards(id:bigint,handId:bigint|undefined,address:`0x${string}`|undefined,enabled:boolean){
  const publicClient=usePublicClient();const {data:walletClient}=useWalletClient();
  const key=`${id}:${handId}:${address?.toLowerCase()}:${walletClient?.chain.id}`;
  const [state,setState]=useState<ViewState|null>(null);
  const request=useRef<{key:string;cancelled:boolean}|null>(null);
  const autoStarted=useRef('');
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>()=>{if(request.current){request.current.cancelled=true;request.current=null;}},[key,enabled]);
  const view=state?.key===key?state:null;
  const busy=view?.stage==='authorizing'||view?.stage==='decrypting';
  const startedAt=view?.started;
  useEffect(()=>{if(!busy||!startedAt)return;const tick=()=>setElapsed(Math.floor((Date.now()-startedAt)/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[busy,startedAt]);
  const load=useCallback(async(silent=false)=>{
    if(request.current||!enabled||!address||!publicClient||!walletClient||walletClient.chain.id!==ARBITRUM_SEPOLIA_CHAIN_ID||walletClient.account.address.toLowerCase()!==address.toLowerCase())return;
    const client=createCardViewClient();
    const stored=client.acp.getActiveACP(ARBITRUM_SEPOLIA_CHAIN_ID,address);
    const cached=stored?.type==='self'&&stored.issuer.toLowerCase()===address.toLowerCase()&&stored.contracts.some(contract=>contract.toLowerCase()===POKER_ADDRESS.toLowerCase())&&ValidationUtils.isValid(stored).valid?stored:undefined;
    // Background loading must never trigger a signature request.
    if(silent&&(!cached||autoStarted.current===key))return;
    autoStarted.current=key;
    const run={key,cancelled:false};request.current=run;
    const started=Date.now();
    const current=()=>request.current===run&&!run.cancelled;
    const update=(stage:ViewState['stage'],message:string,cards:number[]=[])=>{if(current())setState({key,stage,message,cards,started});};
    update(cached?'decrypting':'authorizing',cached?'Loading your cards automatically with your existing permission.':'Sign the card-view permission in your wallet if asked. No gas transaction.');
    try{
      await withDeadline(client.connect(publicClient as never,walletClient as never),15000);
      if(!current())return;
      const acp=cached??await withDeadline(authorizeCardView(client,address),60000);
      if(!current())return;
      update('decrypting','Permission ready. Waiting for CoFHE to unlock your cards; no further wallet confirmation is needed.');
      const decrypt=async()=>{
        const handles=await publicClient.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getMyHoleCards',args:[id],account:address});
        if(!current())throw new Error('View stopped');
        if(handles.some(handle=>/^0x0+$/.test(handle)))throw new Error('Cards not ready');
        return Promise.all(handles.map(handle=>client.decryptForView(handle,FheTypes.Uint8).withACP(acp).set404RetryTimeout(30000).onPoll(({requestId})=>{if(!current())throw new Error('View stopped');update('decrypting',requestId?'Secure decryption is queued with CoFHE. No extra signature needed.':'CoFHE is still preparing the encrypted deal. Cards appear here when ready.');}).execute()));
      };
      const values=await withDeadline(decrypt(),90000);
      if(!current())return;
      const cards=values.map(Number);
      if(cards.some(card=>!Number.isInteger(card)||card<0||card>51)||cards[0]===cards[1])throw new Error('Invalid cards');
      update('ready','Your cards are visible only here. No card values were sent onchain.',cards);
    }catch(error){
      if(!current())return;
      const rejected=error instanceof Error&&/reject|denied|cancel/i.test(error.message);
      update('error',rejected?'Permission declined. Press Show my cards when you’re ready.':'Card viewing timed out. Finish or cancel any open wallet signature first, then retry. No poker transaction was sent.');
    }finally{run.cancelled=true;if(request.current===run)request.current=null;}
  },[address,enabled,id,key,publicClient,walletClient]);
  useEffect(()=>{if(!enabled)return;const first=setTimeout(()=>void load(true),0);const afterStoreHydrates=setTimeout(()=>void load(true),2000);return()=>{clearTimeout(first);clearTimeout(afterStoreHydrates);};},[enabled,load]);
  const stop=()=>{
    // Do not offer a second signature while an un-cancellable wallet prompt is open.
    if(view?.stage!=='decrypting')return;
    if(request.current)request.current.cancelled=true;request.current=null;
    setState({key,stage:'idle',message:'Stopped waiting locally. You can retry card viewing when ready.',cards:[],started:0});
  };
  return {cards:enabled?(view?.cards||[]):[],stage:view?.stage||'idle',busy,elapsed,message:view?.message||'',load,stop};
}
