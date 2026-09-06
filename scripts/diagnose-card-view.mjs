// Read-only probe of an existing seated wallet's cards. No transactions, no
// card/handle/permission/key output. Supply PRIVATE_KEY only through secure env.
import {createPublicClient,createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {arbitrumSepolia} from 'viem/chains';
import {createCofheClient,createCofheConfig} from '@cofhe/sdk/node';
import {arbSepolia} from '@cofhe/sdk/chains';
import {FheTypes} from '@cofhe/sdk';
import {fheBluffAbi} from '../lib/fhebluff-abi.ts';

const timeout=setTimeout(()=>{console.log(JSON.stringify({stage:'deadline',seconds:120}));process.exit(2);},120000);
const start=Date.now();
const report=(stage,extra={})=>console.log(JSON.stringify({stage,elapsedMs:Date.now()-start,...extra}));
try{
  const key=process.env.PRIVATE_KEY;
  if(!key)throw new Error('Missing key');
  const account=privateKeyToAccount(key);
  const transport=http('https://sepolia-rollup.arbitrum.io/rpc',{timeout:15000,retryCount:0});
  const publicClient=createPublicClient({chain:arbitrumSepolia,transport});
  const wallet=createWalletClient({chain:arbitrumSepolia,transport,account});
  const contract='0xD3d9866cE74B7928beDdD2397441E68191770a2C';
  const handles=await publicClient.readContract({address:contract,abi:fheBluffAbi,functionName:'getMyHoleCards',args:[8n],account:account.address});
  if(handles.some(handle=>/^0x0+$/.test(handle)))throw new Error('No cards');
  report('handles-read');
  const client=createCofheClient(createCofheConfig({supportedChains:[arbSepolia],acp:{defaultContractScopes:{[arbSepolia.id]:[contract]}}}));
  await client.connect(publicClient,wallet);report('client-connected');
  const acp=await client.acp.createSelf({issuer:account.address,contracts:[contract]});report('permission-signed');
  await Promise.all(handles.map(async(handle,index)=>{
    let previous='';
    const value=await client.decryptForView(handle,FheTypes.Uint8).withACP(acp).set404RetryTimeout(30000).onPoll(({requestId})=>{const phase=requestId?'threshold-poll':'submit-retry';if(phase!==previous){previous=phase;report(phase,{card:index+1});}}).execute();
    if(value<0n||value>51n)throw new Error('Invalid card');
    report('card-access-complete',{card:index+1});
  }));
  report('complete');
}catch(error){
  const allowed=['ACP_DENIED','ACP_INVALID','ACP_EXPIRED','CT_NOT_FOUND','CT_SOURCE_TIMEOUT','CT_SOURCE_ERROR','SEAL_FAILED'];
  report('failed',{code:allowed.includes(error?.code)?error.code:'UNCLASSIFIED'});process.exitCode=1;
}finally{clearTimeout(timeout);}
