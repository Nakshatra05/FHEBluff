import { defineChain } from 'viem';

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
export const arbitrumSepoliaCofhe = defineChain({
  id: ARBITRUM_SEPOLIA_CHAIN_ID,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'] } },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' } },
  testnet: true,
});

export const POKER_ADDRESS = (process.env.NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS || '') as `0x${string}`;
export const POKER_DEPLOYMENT_BLOCK = BigInt(process.env.NEXT_PUBLIC_FHEBLUFF_DEPLOYMENT_BLOCK || '304978155');
