import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { Encryptable, FheTypes } from '@cofhe/sdk';
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node';
import { arbSepolia } from '@cofhe/sdk/chains';

const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const contractAddress = process.env.FHEBLUFF_CONTRACT_ADDRESS;
const deployerKey = process.env.PRIVATE_KEY;
if (!contractAddress || !deployerKey) throw new Error('Set FHEBLUFF_CONTRACT_ADDRESS and PRIVATE_KEY');

const artifact = JSON.parse(fs.readFileSync(new URL('../artifacts/contracts/FHEBluff.sol/FHEBluff.json', import.meta.url)));
const transport = http(rpcUrl, { timeout: 30_000 });
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });
const host = privateKeyToAccount(deployerKey);
const guest = privateKeyToAccount(generatePrivateKey());
const hostWallet = createWalletClient({ chain: arbitrumSepolia, transport, account: host });
const guestWallet = createWalletClient({ chain: arbitrumSepolia, transport, account: guest });
const abi = artifact.abi;

async function send(wallet, functionName, args, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const hash = await wallet.writeContract({ address: contractAddress, abi, functionName, args });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
      if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
      return hash;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`${functionName} is waiting for the CoFHE coprocessor (${attempt}/${attempts})…`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

function clientFor(wallet) {
  const client = createCofheClient(createCofheConfig({ supportedChains: [arbSepolia] }));
  return client.connect(publicClient, wallet).then(() => client);
}

async function reveal(client, handles) {
  const results = await Promise.all(handles.map((handle) => client.decryptForTx(handle).withoutACP().execute()));
  return [results.map((result) => Number(result.decryptedValue)), results.map((result) => result.signature)];
}

async function timed(label, operation, timeoutMs = 180_000) {
  console.log(label);
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

console.log('Funding an ephemeral second player…');
const fundingHash = await hostWallet.sendTransaction({ to: guest.address, value: parseEther('0.003') });
await publicClient.waitForTransactionReceipt({ hash: fundingHash, confirmations: 1, timeout: 180_000 });

const tableId = await publicClient.readContract({ address: contractAddress, abi, functionName: 'tableCount' });
await send(hostWallet, 'createTable', [2, 10n, 1000n]);
await send(hostWallet, 'joinTable', [tableId, 1000n]);
await send(guestWallet, 'joinTable', [tableId, 1000n]);
await send(hostWallet, 'startHand', [tableId]);

console.log(`Table #${tableId}: encrypting independent player entropy…`);
const hostClient = await clientFor(hostWallet);
const guestClient = await clientFor(guestWallet);
const [hostEntropy, hostProof] = await hostClient.encryptInputs([Encryptable.uint128(crypto.getRandomValues(new BigUint64Array(1))[0])]).setConsumingContract(contractAddress).execute();
const [guestEntropy, guestProof] = await guestClient.encryptInputs([Encryptable.uint128(crypto.getRandomValues(new BigUint64Array(1))[0])]).setConsumingContract(contractAddress).execute();
await send(hostWallet, 'submitEntropy', [tableId, hostEntropy, hostProof]);
await send(guestWallet, 'submitEntropy', [tableId, guestEntropy, guestProof]);

let remaining = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getShuffleProgress', args: [tableId] });
while (remaining > 0n) {
  await send(hostWallet, 'advanceShuffle', [tableId, remaining > 1n ? 2 : 1], remaining === 51n ? 60 : 12);
  remaining = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getShuffleProgress', args: [tableId] });
  console.log(`Encrypted shuffle: ${remaining}/51 steps remain`);
}

const hostCards = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getMyHoleCards', args: [tableId], account: host });
const guestCards = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getMyHoleCards', args: [tableId], account: guest });
await timed('Creating/reusing the host self-ACP…', () => hostClient.acp.getOrCreateSelfACP());
await timed('Creating/reusing the guest self-ACP…', () => guestClient.acp.getOrCreateSelfACP());
await timed('Decrypting the host hole cards…', () => Promise.all(hostCards.map((handle) => hostClient.decryptForView(handle, FheTypes.Uint8).execute())));
await timed('Decrypting the guest hole cards…', () => Promise.all(guestCards.map((handle) => guestClient.decryptForView(handle, FheTypes.Uint8).execute())));
let unauthorizedRejected = false;
try { await timed('Attempting an unauthorized guest decrypt (must fail)…', () => guestClient.decryptForView(hostCards[0], FheTypes.Uint8).execute()); } catch { unauthorizedRejected = true; }
if (!unauthorizedRejected) throw new Error('Unauthorized hole-card decryption unexpectedly succeeded');

for (let turn = 0; turn < 2; turn++) {
  const view = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getTableView', args: [tableId] });
  const seats = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getSeats', args: [tableId] });
  const actor = seats[0][Number(view[9])].toLowerCase() === host.address.toLowerCase() ? hostWallet : guestWallet;
  await send(actor, 'act', [tableId, 4, 0n]);
}

for (let street = 0; street < 3; street++) {
  const handles = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getCommunityHandles', args: [tableId] });
  const [values, signatures] = await reveal(hostClient, handles);
  await send(hostWallet, 'publishCommunity', [tableId, values, signatures]);
}
const showdownHandles = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getShowdownHandles', args: [tableId] });
const [showdownValues, showdownSignatures] = await reveal(hostClient, showdownHandles);
await send(hostWallet, 'settleShowdown', [tableId, showdownValues, showdownSignatures]);

const finalView = await publicClient.readContract({ address: contractAddress, abi, functionName: 'getTableView', args: [tableId] });
if (Number(finalView[5]) !== 7 || finalView[7] !== 0n) throw new Error('Live hand did not settle cleanly');
console.log(`PASS: live CoFHE hand #${finalView[6]} settled; opponent decryption was rejected.`);
