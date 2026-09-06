'use client';

import {useEffect,useState} from 'react';
import {usePublicClient,useWalletClient} from 'wagmi';
import {createCardViewClient} from '@/lib/cofhe-client';
import {usePokerDeployment} from '@/lib/poker-deployment';
import {fheBluffAbi} from '@/lib/fhebluff-abi';
import {withDeadline} from '@/lib/async-deadline';
import {retryPrivateRead} from '@/lib/retry-private-read';
import {ARBITRUM_SEPOLIA_CHAIN_ID} from '@/lib/network';

type Proof={decryptedValue:bigint;signature:`0x${string}`};
type State={key:string;proofs:Proof[];message:string;ready:boolean};
// Only handles already authorized for public reveal are requested. No wallet
// signing, publishing, future-street decryption, or hole-card access happens here.
export function usePublicReveal(id:bigint,hand:bigint|undefined,phase:number,revealed:number,enabled:boolean){
  const {address:contract}=usePokerDeployment();
  const publicClient=usePublicClient();const {data:walletClient}=useWalletClient();
  const key=`${contract}:${id}:${hand}:${phase}:${revealed}:${walletClient?.account.address}:${walletClient?.chain.id}`;
  const [state,setState]=useState<State>();
  useEffect(()=>{
    if(!enabled||!publicClient||!walletClient||walletClient.chain.id!==ARBITRUM_SEPOLIA_CHAIN_ID)return;
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    const client=createCardViewClient(contract);
    const cache=new Map<string,Proof>();
    const update=(message:string,proofs:Proof[]=[],ready=false)=>{if(active)setState({key,message,proofs,ready});};
    const prepare=async()=>{
      let cycleActive=true;
      update('Connecting to the reveal service…');
      try{
        const [,handles]=await Promise.all([
          withDeadline(client.connect(publicClient as never,walletClient as never),15000),
          withDeadline(publicClient.readContract({address:contract,abi:fheBluffAbi,functionName:phase===6?'getShowdownHandles':'getCommunityHandles',args:[id]}),15000),
        ]);
        if(!active)return;
        if(!handles.length)throw new Error('Reveal state changed');
        update(`Preparing public cards · ${cache.size}/${handles.length}`);
        const proofs=await Promise.all(handles.map(handle=>retryPrivateRead(async current=>{
          const cached=cache.get(handle);if(cached)return cached;
          const proof=await client.decryptForTx(handle).withoutACP().set404RetryTimeout(15000).onPoll(()=>{if(!current())throw new Error('View stopped');}).execute();
          if(!current())throw new Error('View stopped');
          if(proof.decryptedValue<0n||proof.decryptedValue>51n)throw new Error('Invalid card');
          cache.set(handle,proof);
          update(`Preparing public cards · ${cache.size}/${handles.length}`);
          return proof;
        },()=>active&&cycleActive)));
        update('Cards ready · confirm the reveal in your wallet.',proofs,true);
      }catch{
        if(!active)return;
        update('Reveal service is taking longer than expected. Reconnecting automatically…');
        timer=setTimeout(()=>void prepare(),15000);
      }finally{cycleActive=false;}
    };
    void prepare();
    return()=>{active=false;clearTimeout(timer);cache.clear();};
  },[key,enabled,publicClient,walletClient,contract,id,phase]);
  return state?.key===key?state:{key,proofs:[],message:'Preparing public cards…',ready:false};
}
