import {encodeFunctionData, parseAbi} from 'viem';
import {arbitrumSepolia} from 'viem/chains';

export const DEAL_ROUTER = arbitrumSepolia.contracts.multicall3.address;
export const shuffleAbi = parseAbi(['function advanceShuffle(uint256 tableId, uint8 steps)']);

// Only permissionless shuffle work belongs in this batch. Player actions and
// entropy submissions must go directly to poker to preserve msg.sender.
export function buildDealCalls(poker:`0x${string}`,tableId:bigint,remaining:number) {
  if(tableId<0n||!Number.isInteger(remaining)||remaining<1||remaining>17)throw new Error('Invalid deal progress');
  return Array.from({length:Math.ceil(remaining/4)},(_,index)=>({
    target:poker,allowFailure:false,
    callData:encodeFunctionData({abi:shuffleAbi,functionName:'advanceShuffle',args:[tableId,Math.min(4,remaining-index*4)]}),
  }));
}
