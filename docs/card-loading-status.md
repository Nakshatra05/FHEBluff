# Card loading status

The current release merges completed and no-contest hand events from both deployed contracts into one chronological History. Contract selection remains internal to each history link because table IDs overlap; returning from an older table goes to the one current lobby. No version banner or separate legacy lobby is exposed.

Card access permission is now prepared after the player's encrypted entropy contribution confirms. This allows the signature to complete while the other player and encrypted deal progress. Subsequent viewing reuses a valid owner-and-contract-scoped ACP. No hole cards are passed to this setup operation.

This does not reduce CoFHE execution time. Source inspection shows a serial dependency chain in the sampler: two 128-bit remainder operations per draw, collision comparisons, and encrypted insertion updates. For heads-up there are nine draws, hence eighteen 128-bit remainder operations before final card handles are assigned. This is a suspected computation bottleneck, not a measured end-to-end latency diagnosis. The SDK also waits for ciphertext availability and threshold-network responses, separately from wallet signing.

Before claiming a speed improvement, benchmark live entropy confirmation → final deal confirmation → ciphertext availability → both local card results using two wallets. Record only timings and sanitized error codes, never entropy, card values, ACP objects, signatures, or response payloads. A faster sampler needs privacy/uniformity analysis and live timing before another contract deployment; changing to a plaintext dealer would change the trust model and is not part of this release.

The readiness gate remains enabled. Moving the delay into a betting timer would not fix card access and would make players risk chips before seeing their hand.

## Live read-only probe, September 6 2026

Using the supplied seated test wallet on original table 8, with a newly signed contract-scoped ACP: encrypted handles read at 584ms, client connected at 589ms, permission signed at 2927ms, first card available at 3506ms, second at 3549ms. No transaction was sent and no private values, handles, ACPs, or keys were output. The signer was passed only through non-echoing input and a child-process environment.

This establishes that already-processed ciphertext can be viewed quickly from this runtime. It does not measure fresh-deal processing or the user's browser wallet latency. Those remain to be benchmarked; the serial sampler is still a hypothesis, not a proven timing attribution.
