# FHEBluff

**Private cards. Public game.** FHEBluff is a multiplayer Texas Hold'em dApp on Arbitrum Sepolia. Its public betting state remains auditable onchain while hole cards and the undealt deck are CoFHE ciphertexts. Privy provides login and embedded/external wallet access.

> FHEBluff uses testnet play chips and non-transferable reputation Credits. It does not custody money or issue a token. The contracts have not received a third-party security audit.

## Live deployment

- Network: Arbitrum Sepolia (`421614`)
- Contract: [`0xD3d9866cE74B7928beDdD2397441E68191770a2C`](https://sepolia.arbiscan.io/address/0xD3d9866cE74B7928beDdD2397441E68191770a2C)
- Source verification: [Sourcify contract page](https://repo.sourcify.dev/421614/0xD3d9866cE74B7928beDdD2397441E68191770a2C)
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
3. Ordered Floyd sampling generates only the 9–17 unique cards a hand can actually use, then inserts each at an encrypted random position. The contract processes at most four cards per call. **Deal all cards** combines the remaining calls into one atomic Multicall3 transaction, with simulation before signing. The smaller-batch option remains available when the RPC or gas estimate cannot handle the combined transaction. This reduces wallet confirmations, not the underlying CoFHE computation time.
4. The contract grants `FHE.allow` access to each player for only that player's two ciphertext handles. The frontend obtains a self ACP and decrypts those handles locally with `decryptForView`.
5. Community cards become public only when their street is reached. At showdown, active players' cards are deliberately published through CoFHE threshold-signed `decryptForTx` results so the contract can evaluate and settle the hand. Folded hands are never revealed.

Ciphertext handles are opaque public identifiers, not card values. Returning a handle from a view function does not grant decryption permission; CoFHE's onchain ACL is the security boundary. No event contains a private card value.

### Public poker state

Seats, stacks, bets, pot size, dealer, turn, phase, action deadline, folds/all-ins, revealed board cards, settlement, Credits, and leaderboard rankings are intentionally public. Action methods authenticate with `msg.sender`, reject out-of-turn or invalid betting, and guard against repeated settlement.

The engine supports 2–6 players, blinds, check/call/raise/fold/all-in, betting-round transitions, two-minute disconnected-player timeout folding, timed recovery from a stalled encrypted deal, host seat removal between hands, side pots, multiple all-ins, ties, persistent Credits, and next-hand rotation. All-in boards are revealed in one runout transaction instead of one transaction per street.

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
NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS=0xD3d9866cE74B7928beDdD2397441E68191770a2C
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

Hardhat uses the official CoFHE Arbitrum Sepolia preset. Contract tests run against the CoFHE mock environment and cover owner-only decryption, rejected unauthorized decryption, encrypted multi-party entropy, unique dealing, host reassignment, abandonment and stalled-deal recovery, single settlement, multiple all-ins, side pots, and chip conservation.

`smoke:arb-sepolia` creates a temporary two-wallet table on the deployed contract, submits independently encrypted entropy, advances the real encrypted shuffle, verifies that cross-player decryption is rejected, and settles the hand through CoFHE threshold decryption. It requires the server-only variables `PRIVATE_KEY` and `FHEBLUFF_CONTRACT_ADDRESS`; the generated guest key exists only for that process.

## Beginner experience

- **Play instantly** opens a local teaching game against a computer, with contextual coaching, a hand ranking cheat sheet, and a move recap. It requires no wallet or transactions. It uses simplified fixed bets, equal antes, and one raise per street; it is explicitly unranked and is not a CoFHE game. Each hand starts with equal 500-chip stacks. Results are session-only and never award Credits.
- **Find me a seat** opens an occupied, available table, preferring smaller tables. If none is available, the same button opens table creation. New tables default to two seats, 5/10 blinds, and 500 free play chips. Joining still requires test ETH for gas.
- Table creation opens the newly created table after confirmation. **Copy friend invite** generates a `/play?table=ID` link that opens that table.
- Multiplayer has a contextual next-step guide. Check/call and fold are the primary controls; raise presets and all-in are under “Bet more”. Moves are simulated before a signing request, buttons lock while a request is processing, and errors use plain language. CoFHE deal and reveal transactions still require explicit wallet confirmations.
- The lobby shows the wins needed to surpass the next higher Credit total using current leaderboard scores. Credits remain contract-awarded: +1 for every winning player of a completed hand, including tied winners. There are no practice, participation, or self-claim Credit bonuses. This is an all-time Credit ranking, not a skill/Elo rating.
- Locally decrypted live hole cards are scoped to table, hand, and wallet before display. They are not used by the practice opponent or persisted in browser storage.

### Deal, card viewing, and hand outcomes

- **One-confirmation deal:** uses the canonical Arbitrum Sepolia Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`. Only permissionless `advanceShuffle` calls are batched; never player actions or entropy submissions, whose `msg.sender` must remain the player. Every subcall uses `allowFailure: false`, no ETH value is sent to the router, and no token approvals are requested. The poker contract and Credits are unchanged. A stale batch safely reverts if someone else finishes the deal first.
- **Card viewing is not a poker transaction.** It uses an ACP message signature (reused when valid), followed by CoFHE offchain decryption. Onchain transaction confirmation does not imply that the encrypted computation has finished. Viewing runs independently of betting, shows elapsed time, and permits stopping a decrypt wait. Connection/signature/decryption UI waits have explicit bounds; late results are discarded. A pending signature is reused rather than opening duplicate wallet requests. New ACPs are contract-scoped; existing owner ACLs still govern every ciphertext.
- The arena is silent: no music, audio permissions, or background audio processing. Player stacks, bets, turn badges, and pot values come from contract reads; unrevealed community cards use empty slots, not invented cards.
- **Open tables** contains only seating-phase tables with room. Full tables are under Active hands. Settled hands are under **History**, with receipts and an Open / Rematch button. Empty, permanently closed tables no longer have a separate abandoned-table section.
- **Timeout outcomes:** an undealt hand can be closed with zero chip change and no Credits (`HandAborted` on the existing contract, presented as No contest). During betting, the timed-out active player folds; the last player wins or play continues. Pending board reveals and all-in players are never offered timeout-fold by the UI. Showdown still requires valid CoFHE reveals; no arbitrary clock-based winner is invented.
- **Operational limit:** blockchains do not execute timers autonomously. A player or spectator must confirm the permissionless recovery/reveal transaction. This release does not add a funded keeper, alter the deployed timeout rules, or guarantee settlement during a CoFHE outage. The existing contract is not upgradeable; its onchain enum still calls an empty table `Abandoned`.

Regression checks:

```bash
node --test test/game-ux.test.mjs test/transaction-feedback.test.mjs test/practice-poker.test.mjs
npm run contracts:test
```

Read-only batch simulation against a historical ready-to-deal hand (Node 24+; no keys or transactions):

```bash
DOTENV_CONFIG_PATH=.env.local node scripts/check-deal-batch.mjs 5
```

The table #5 nine-card deal passed this simulation at Arbitrum Sepolia block `306040057`. Local CoFHE mock tests additionally verify batch rollback, owner-only decryption, timeout settlement, chip conservation, and no duplicate Credits. A historical simulation is not a claim that every larger table fits the current network gas limit.

Run practice engine checks with Node.js 24 or newer:

```bash
node --test test/practice-poker.test.mjs
```

## Privacy and operational notes

- App-owned menus and creation dialogs share the square, high-contrast theme. Privy and external wallet prompts remain provider-controlled. Table presets indicate their selected state, profiles expose a selectable full public wallet address, and tied Credit totals use competition ranks (1, 2, 2, 4).

- The neo-brutalist UI uses square panels, hard shadows, 48px primary touch controls, and a 12px minimum for dense metadata. Body/help text and ordinary labels are larger. Controls stay below the table in document flow rather than covering it.

- The lobby offers two immediate paths: wallet-free practice or multiplayer tables. Learning help and community statistics are collapsed by default. Desktop tabs and mobile navigation expose the same six views.
- The wallet address opens an explicit profile/copy/logout menu; merely clicking the address no longer disconnects the player. Table cards distinguish free starting chips from the current pot and indicate occupied seats.

- The poker table and compact controls stay in normal document flow, so expanded raise/help panels cannot cover the table. Help starts collapsed; touch actions remain at least 44px high.
- Card viewing automatically starts after dealing when a valid, wallet-matching self-ACP scoped to this poker contract is already stored. Background loading never creates a permission or opens a signature request. New permissions still require the player's explicit action.
- A mined deal is not proof that the offchain CoFHE computation has finished. The card status distinguishes preparation from queued decryption; local waiting is bounded and can be stopped without locking betting controls. This improves avoidable client latency, not the network coprocessor's speed.

- Never log decrypted cards, encryption inputs, proofs, or ACP private material.
- ACP self-permissions are created by the player client; only the player receives ACL access to their hole-card handles.
- An RPC caller may spoof the `from` field on a view call and retrieve an opaque handle, but cannot decrypt it without the separately enforced CoFHE ACL permission.
- Community and showdown publishing is an intentional protocol transition, not a fallback to plaintext storage.
- CoFHE operations are asynchronous. Shuffle and threshold-decryption transactions can take longer than ordinary EVM calls and require the network coprocessor to be healthy.
- Before any mainnet or value-bearing use, commission independent Solidity, game-theory, access-control, frontend, and CoFHE-specific audits.

## Primary references

### End-of-hand experience

Settled hands display a prominent personal result, the event's total pot, verified winners, Credits, and a signature-free Back to lobby action. Fold/showdown explanations use the settlement transaction type; they never invent hand ranks or individual side-pot payouts. Historical pre-settlement seats establish participation (when available), so spectators and later joiners are not labeled losers. Missing result data remains neutral and retries. Table seats persist until explicitly left; hosts may start another hand. Practice has its own large outcome, explanation, and net-chip summary, without awarding Credits.

- [CoFHE client overview](https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview)
- [CoFHE compatibility and network matrix](https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility)
- [CoFHE access-control permissions](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/access-control)
- [CoFHE ACP guide](https://cofhe-docs.fhenix.zone/client-sdk/guides/acps)
- [CoFHE encrypted inputs](https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-encrypted-data)
- [CoFHE transaction decryption](https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-tx)
- [Privy React quickstart](https://docs.privy.io/basics/react/quickstart)
- [Privy Wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi)
