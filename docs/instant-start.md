# Automatic betting start

FHEBluffInstant is deployed on Arbitrum Sepolia at `0xBF9d14F5ed0C0fd22102fd38538c1234bB38ACAe`, starting at block `306124059`. New lobby tables use this deployment and the HEART display namespace.

The final encrypted-deal transaction grants the same per-player card ACLs, posts blinds, and starts pre-flop with a 120-second turn window. There is no separate readiness acknowledgement. Both private cards load independently in the frontend; a player may need to act before decryption finishes. This does not reduce CoFHE processing latency and does not remove ordinary betting transaction approvals.

The existing readiness contract behavior is unchanged. Its deployed bytecode is immutable; existing SPADE tables still require acknowledgements and old invitations continue routing there. Returning to the lobby selects the new deployment. CLUB and SPADE results and earned Credits remain combined with HEART results.

Validation: local CoFHE mock tests exercise betting before decryption, private access and denied opponent access, out-of-turn/outsider rejection, readiness-call rejection, and fold settlement. Live deployment code was confirmed; a fresh multi-wallet production hand has not been run for this release. No fresh-deal latency claim is made.
