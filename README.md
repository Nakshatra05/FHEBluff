# FHEBluff

**Private cards. Public game.** FHEBluff is a multiplayer Texas Hold'em dApp on Arbitrum Sepolia. Its public betting state remains auditable onchain while hole cards and the undealt deck are CoFHE ciphertexts. Privy provides login and embedded/external wallet access.

> FHEBluff uses testnet play chips and non-transferable reputation Credits. It does not custody money or issue a token. The contracts have not received a third-party security audit.

## Live deployment

- Network: Arbitrum Sepolia (`421614`)
- Contract: [`0x155e95b2375d90d545629768B7a89D8f08ce1822`](https://sepolia.arbiscan.io/address/0x155e95b2375d90d545629768B7a89D8f08ce1822)
- Verified source: [Sourcify exact creation and runtime match](https://repo.sourcify.dev/421614/0x155e95b2375d90d545629768B7a89D8f08ce1822)
- Seeded lobby: Table `#0`, six seats, 10/20 blinds, 1,000 minimum buy-in
- CoFHE client / React SDK: `0.7.1`
- CoFHE contracts: `0.2.0`

## Architecture

The project separates the frontend, contract interface, encryption client, and Solidity engine:

- `app/` — public landing page and responsive poker application
- `lib/cofhe-client.ts` — CoFHE browser client and Arbitrum Sepolia configuration
- `lib/fhebluff-abi.ts` — typed contract interface used by the application
- `contracts/FHEBluff.sol` — table lifecycle, betting, encrypted dealing, settlement, Credits, and leaderboard
- `contracts/PokerHandEvaluator.sol` — deterministic seven-card hand evaluator
- `test/FHEBluff.test.cjs` — contract lifecycle and confidentiality integration tests
- `scripts/` — deploy and seed scripts

### Confidential dealing

1. Every active player creates 128 bits of entropy locally and encrypts it with `@cofhe/sdk`. The proof is bound to the FHEBluff contract with `setConsumingContract`.
2. The contract verifies each external encrypted input and XORs all player contributions with CoFHE encrypted randomness.
3. A progressive Fisher-Yates shuffle operates on an encrypted 52-card deck. Anyone may advance the shuffle, avoiding a single oversized FHE transaction.
4. The contract grants `FHE.allow` access to each player for only that player's two ciphertext handles. The frontend obtains a self ACP and decrypts those handles locally with `decryptForView`.
5. Community cards become public only when their street is reached. At showdown, active players' cards are deliberately published through CoFHE threshold-signed `decryptForTx` results so the contract can evaluate and settle the hand. Folded hands are never revealed.

Ciphertext handles are opaque public identifiers, not card values. Returning a handle from a view function does not grant decryption permission; CoFHE's onchain ACL is the security boundary. No event contains a private card value.

### Public poker state

Seats, stacks, bets, pot size, dealer, turn, phase, action deadline, folds/all-ins, revealed board cards, settlement, Credits, and leaderboard rankings are intentionally public. Action methods authenticate with `msg.sender`, reject out-of-turn or invalid betting, and guard against repeated settlement.

The engine supports 2–6 players, blinds, check/call/raise/fold/all-in, betting-round transitions, disconnected-player timeout folding, side pots, multiple all-ins, ties, persistent Credits, and next-hand rotation.

## Local development

Requires Node.js `22.13+`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the public browser variables in `.env.local`:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS=0x155e95b2375d90d545629768B7a89D8f08ce1822
```

The deployer key is server/CLI-only. Never prefix it with `NEXT_PUBLIC_`, commit it, or put it in frontend code:

```env
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=0x...
```

All `.env*` files are ignored. `.env.example` is the sole exception and contains placeholders only.

## Verify and deploy

```bash
npm run lint
npm run build
npm run contracts:compile
npm run contracts:test
npm run smoke:arb-sepolia
npm run deploy:arb-sepolia
npm run seed:arb-sepolia
```

Hardhat uses the official CoFHE Arbitrum Sepolia preset. Contract tests run against the CoFHE mock environment and cover owner-only decryption, rejected unauthorized decryption, encrypted multi-party entropy, unique dealing, host reassignment, abandonment, single settlement, multiple all-ins, side pots, and chip conservation.

`smoke:arb-sepolia` creates a temporary two-wallet table on the deployed contract, submits independently encrypted entropy, advances the real encrypted shuffle, verifies that cross-player decryption is rejected, and settles the hand through CoFHE threshold decryption. It requires the server-only variables `PRIVATE_KEY` and `FHEBLUFF_CONTRACT_ADDRESS`; the generated guest key exists only for that process.

## Privacy and operational notes

- Never log decrypted cards, encryption inputs, proofs, or ACP private material.
- ACP self-permissions are created by the player client; only the player receives ACL access to their hole-card handles.
- An RPC caller may spoof the `from` field on a view call and retrieve an opaque handle, but cannot decrypt it without the separately enforced CoFHE ACL permission.
- Community and showdown publishing is an intentional protocol transition, not a fallback to plaintext storage.
- CoFHE operations are asynchronous. Shuffle and threshold-decryption transactions can take longer than ordinary EVM calls and require the network coprocessor to be healthy.
- Before any mainnet or value-bearing use, commission independent Solidity, game-theory, access-control, frontend, and CoFHE-specific audits.

## Primary references

- [CoFHE client overview](https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview)
- [CoFHE compatibility and network matrix](https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility)
- [CoFHE access-control permissions](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/access-control)
- [CoFHE ACP guide](https://cofhe-docs.fhenix.zone/client-sdk/guides/acps)
- [CoFHE encrypted inputs](https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-encrypted-data)
- [CoFHE transaction decryption](https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-tx)
- [Privy React quickstart](https://docs.privy.io/basics/react/quickstart)
- [Privy Wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi)
