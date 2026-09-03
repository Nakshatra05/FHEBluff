// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, externalEuint8} from '@fhenixprotocol/cofhe-contracts/FHE.sol';

contract ConfidentialCardHarness {
    mapping(address => euint8) private cards;
    function store(externalEuint8 input, bytes calldata proof) external {
        euint8 card = FHE.asEuint8(input, proof);
        cards[msg.sender] = card;
        FHE.allowThis(card);
        FHE.allow(card, msg.sender);
    }
    function myCard() external view returns (bytes32) { return euint8.unwrap(cards[msg.sender]); }
    function handleOf(address player) external view returns (bytes32) { return euint8.unwrap(cards[player]); }
}
