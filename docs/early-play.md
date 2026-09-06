# Optional early play

Players may explicitly choose **Play while cards load** during the readiness phase. The existing contract's `confirmCardsReady` acknowledges intent, not proof of decryption; no contract migration or new card permissions are needed.

The first acknowledgement does not start betting. Once every active seat opts in, the contract posts blinds and starts its normal turn deadline. The UI explains that cards may still be hidden and the clock will not pause. Players may instead wait for their cards before opting in. Readiness remains scoped to the current hand and wallet, and duplicate/pending actions are disabled.

This removes a decryption-dependent UI gate, not the underlying CoFHE processing time or required wallet transactions. Card loading continues independently in the same hand. Private card ACLs and encrypted deck generation are unchanged.

Display names use a stable namespace: CLUB for original-deployment tables and SPADE for current-deployment tables, with the contract's zero-based table ID displayed one-based. Links retain the original contract-local ID and version; no onchain data is renamed or migrated.
