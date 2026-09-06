// Read-only RPC check against a historical, ready-to-deal table. Sends no transactions.
import 'dotenv/config';
import {createPublicClient,http,parseAbi,multicall3Abi} from 'viem';
import {arbitrumSepolia} from 'viem/chains';
import {buildDealCalls,DEAL_ROUTER} from '../lib/deal-batch.ts';
const client=createPublicClient({chain:arbitrumSepolia,transport:http(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,{timeout:30000})});
const poker=process.env.NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS;
const abi=parseAbi(['event EntropyAccepted(uint256 indexed tableId,address indexed player)','function getShuffleProgress(uint256) view returns (uint8)']);
const tableId=BigInt(process.argv[2]||'5');
const gas=BigInt(process.argv[3]||'16000000');
const logs=await client.getContractEvents({address:poker,abi,eventName:'EntropyAccepted',args:{tableId},fromBlock:304978155n,toBlock:'latest'});
const blockNumber=logs.at(-1)?.blockNumber;
if(!blockNumber)throw new Error('No entropy event for table');
const remaining=await client.readContract({address:poker,abi,functionName:'getShuffleProgress',args:[tableId],blockNumber});
const code=await client.getCode({address:DEAL_ROUTER});
if(!code||code==='0x')throw new Error('Missing Multicall3 code');
const args=[buildDealCalls(poker,tableId,remaining)];
const started=Date.now();
try {
  await client.simulateContract({address:DEAL_ROUTER,abi:multicall3Abi,functionName:'aggregate3',args,blockNumber,gas});
  console.log(JSON.stringify({tableId:String(tableId),blockNumber:String(blockNumber),remaining,calls:args[0].length,gasBudget:String(gas),simulation:'passed',elapsedMs:Date.now()-started}));
} catch(error) {
  console.error(JSON.stringify({tableId:String(tableId),blockNumber:String(blockNumber),remaining,calls:args[0].length,simulation:'failed',reason:error.shortMessage||error.name,details:error.details?.slice(0,240)}));
  process.exitCode=1;
}
