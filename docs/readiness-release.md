# Readiness release

Deployed on Arbitrum Sepolia (421614) at `0x3D3aaFF33c73880e5d7837D24e4c736D7522FDF1`, block `306087732`. The frontend now selects this deployment for `/play`. The deployment signer was supplied through non-echoing input and a child-process environment; no key was persisted.

## Routing and reputation

- New invitations include `version=ready`. Original unversioned `?table=8` links continue to address the original contract, never successor table 8.
- `/play?version=legacy` preserves original tables and history. Its timers cannot be retroactively protected.
- ACP creation, client instances, pending permissions, and private-view keys are scoped by deployment address.
- The Credits board sums recorded wins across both contracts and includes the connected wallet after its Credits reads complete, even at zero. This local entry is **not** a durable global login registry. Listing every login for all visitors still requires authenticated shared storage; no database or server authentication credentials are configured by this change.
- Contract tests cover two players viewing their own cards, denying opponent access, readiness, expiry, stale hand acknowledgements, and the original poker lifecycle. Live two-wallet browser decryption speed has not been verified for this release.

`contracts/FHEBluffReady.sol` is a separate successor contract. It does not change existing tables, balances, Credits, or permissions in the deployed FHEBluff contract.

After the encrypted deal, phase 9 (`AwaitingCards`) grants each player the existing owner-only CoFHE card permissions but does not post blinds. A five-minute preparation deadline begins. Each active player calls `confirmCardsReady(tableId, expectedHandId)`. Only the final acknowledgement posts blinds and starts the ordinary two-minute betting timer. Neither cards nor card-derived proofs are submitted by this acknowledgement.

After preparation expires, anyone can call `abortStalledHand`. No chips have been committed; stacks and Credits remain unchanged. Readiness does not extend the deadline. Hand IDs prevent stale acknowledgements from accepting a later deal.

## Limitations

- An acknowledgement is intent to play, not proof that decryption succeeded. The UI must enable it only after both local cards are available, but a custom client can bypass that UI check.
- A player can withhold readiness after seeing their cards. Free preparation cancellation therefore permits selective aborts. This is a testnet UX tradeoff, not suitable for real-money competitive play without further protocol design.
- CoFHE processing latency is unchanged. This gate removes blind betting during preparation, not the underlying delay.
- Local CoFHE mocks test state transitions and ACLs, not live decryption speed.
- Reloading or losing local cards after readiness can still require another decryption. Do not present readiness as a guarantee that a player can never lose access during a hand.

## Before activation

1. Configure a fresh funded testnet signer in the ignored local `.env`, never in chat or a `NEXT_PUBLIC_*` variable.
2. Run `hardhat test test/FHEBluffReady.test.cjs test/FHEBluff.test.cjs`.
3. Deploy with `hardhat run scripts/deploy-ready.cjs --network arb-sepolia`.
4. Integrate phase 9, readiness reads/writes, permission preparation, and cancellation into the frontend. Confirm readiness only by explicit player action after two local cards are visible.
5. Preserve the old contract through a clearly labeled legacy route and its own address-scoped CoFHE client. Do not replace the existing address before this integration is complete. Credits remain on the original contract; do not imply they migrated.
6. Validate with two independently connected test wallets, including slow/failed decryption and rejection/timeout paths. Then activate the new-table flow.

No relayer, unattended spending, session authority, or deployment credential is included in this release.
