// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {FHEBluffReady} from "./FHEBluffReady.sol";

/// @notice Posts blinds and opens betting in the deal-completion transaction.
/// Private decryption is independent; the normal clock runs while cards load.
contract FHEBluffInstant is FHEBluffReady {
    function _requiresCardReadiness() internal pure override returns(bool) { return false; }
}
