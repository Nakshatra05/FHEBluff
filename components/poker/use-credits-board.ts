'use client';
import {useReadContracts} from 'wagmi';
import {deployments} from '@/lib/poker-deployment';
import {fheBluffAbi} from '@/lib/fhebluff-abi';
import {mergeCredits,type CreditsBoard} from '@/lib/credits-board';

export function useCreditsBoard(address?:`0x${string}`){
  const contracts=Object.values(deployments);
  const {data:boards}=useReadContracts({contracts:contracts.map(deployment=>({address:deployment.address,abi:fheBluffAbi,functionName:'leaderboard' as const,args:[100n] as const})),query:{refetchInterval:15000}});
  const {data:own}=useReadContracts({contracts:address?contracts.map(deployment=>({address:deployment.address,abi:fheBluffAbi,functionName:'credits' as const,args:[address] as const})):[],query:{enabled:!!address,refetchInterval:5000}});
  const creditData=own?.length===contracts.length&&own.every(entry=>entry.status==='success')?own.reduce((sum,entry)=>sum+(entry.result as bigint),0n):undefined;
  // A local zero-credit entry is not represented as a global registration.
  const leaderData=mergeCredits((boards??[]).map(entry=>entry.status==='success'?entry.result as CreditsBoard:undefined),address,creditData);
  return {creditData,leaderData};
}
