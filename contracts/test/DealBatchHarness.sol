// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Test-only CALL batch matching the aggregate3 semantics used by the frontend.
// Production uses the canonical deployed Multicall3, not this harness.
contract DealBatchHarness {
    struct Call3 { address target; bool allowFailure; bytes callData; }
    function aggregate3(Call3[] calldata calls) external {
        for (uint256 i; i < calls.length; ++i) {
            (bool success, bytes memory result) = calls[i].target.call(calls[i].callData);
            if(!success && !calls[i].allowFailure){
                if(result.length==0)revert("batch failed");
                assembly {revert(add(result,32),mload(result))}
            }
        }
    }
}
