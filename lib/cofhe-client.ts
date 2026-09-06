'use client';

import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { chains } from '@cofhe/sdk/chains';
import { POKER_ADDRESS } from './network';

const cofheConfig = createCofheConfig({ supportedChains: [chains.arbSepolia], acp: {defaultContractScopes:{[chains.arbSepolia.id]:[POKER_ADDRESS]}} });
export const cofheClient = createCofheClient(cofheConfig);
// A view request must not share mutable connection state with deal/reveal writes.
export const createCardViewClient = () => createCofheClient(cofheConfig);

// Reuse a still-open signature request instead of stacking wallet popups after
// a local UI timeout. Only pending promises are held here, never plaintext cards.
const cardPermissions=new Map<string,ReturnType<typeof cofheClient.acp.getOrCreateSelfACP>>();
export function authorizeCardView(client:ReturnType<typeof createCardViewClient>,account:`0x${string}`){
  const key=`${chains.arbSepolia.id}:${account.toLowerCase()}`;
  const existing=cardPermissions.get(key);if(existing)return existing;
  const pending=client.acp.getOrCreateSelfACP(chains.arbSepolia.id,account);
  cardPermissions.set(key,pending);
  void pending.then(()=>cardPermissions.delete(key),()=>cardPermissions.delete(key));
  return pending;
}
