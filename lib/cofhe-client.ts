'use client';

import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { chains } from '@cofhe/sdk/chains';
import { POKER_ADDRESS } from './network';

const configFor = (address:`0x${string}`) => createCofheConfig({ supportedChains: [chains.arbSepolia], acp: {defaultContractScopes:{[chains.arbSepolia.id]:[address]}} });
const cofheConfig = configFor(POKER_ADDRESS);
export const cofheClient = createCofheClient(cofheConfig);
// A view request must not share mutable connection state with deal/reveal writes.
export const createCardViewClient = (address:`0x${string}`=POKER_ADDRESS) => createCofheClient(configFor(address));

// Reuse a still-open signature request instead of stacking wallet popups after
// a local UI timeout. Only pending promises are held here, never plaintext cards.
const cardPermissions=new Map<string,ReturnType<typeof cofheClient.acp.getOrCreateSelfACP>>();
export function authorizeCardView(client:ReturnType<typeof createCardViewClient>,account:`0x${string}`,contract:`0x${string}`=POKER_ADDRESS){
  const key=`${chains.arbSepolia.id}:${contract.toLowerCase()}:${account.toLowerCase()}`;
  const existing=cardPermissions.get(key);if(existing)return existing;
  // Called only when no valid contract-scoped ACP was found. Never reuse an
  // active permission from the other deployment merely because wallets match.
  const pending=client.acp.createSelf({issuer:account,contracts:[contract],name:'FHEBluff private cards'});
  cardPermissions.set(key,pending);
  void pending.then(()=>cardPermissions.delete(key),()=>cardPermissions.delete(key));
  return pending;
}
