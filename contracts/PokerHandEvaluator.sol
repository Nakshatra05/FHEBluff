// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library PokerHandEvaluator {
    uint256 private constant BASE = 15;

    function evaluate7(uint8[7] memory cards) internal pure returns (uint256 best) {
        for (uint256 a; a < 3; ++a) for (uint256 b = a + 1; b < 4; ++b)
            for (uint256 c = b + 1; c < 5; ++c) for (uint256 d = c + 1; d < 6; ++d)
                for (uint256 e = d + 1; e < 7; ++e) {
                    uint8[5] memory hand = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                    uint256 score = evaluate5(hand);
                    if (score > best) best = score;
                }
    }

    function evaluate5(uint8[5] memory cards) internal pure returns (uint256) {
        uint8[15] memory count;
        uint8 suit = cards[0] / 13;
        bool flush = true;
        for (uint256 i; i < 5; ++i) {
            require(cards[i] < 52, "invalid card");
            uint8 rank = (cards[i] % 13) + 2;
            count[rank]++;
            if (cards[i] / 13 != suit) flush = false;
        }
        uint8 straightHigh = _straightHigh(count);
        if (flush && straightHigh > 0) return _pack(8, straightHigh, 0, 0, 0, 0);
        uint8 four; uint8 three; uint8 pairHigh; uint8 pairLow;
        for (uint8 r = 14; r >= 2; --r) {
            if (count[r] == 4) four = r;
            else if (count[r] == 3) three = r;
            else if (count[r] == 2) { if (pairHigh == 0) pairHigh = r; else pairLow = r; }
            if (r == 2) break;
        }
        if (four > 0) return _pack(7, four, _highestExcept(count, four, 0), 0, 0, 0);
        if (three > 0 && pairHigh > 0) return _pack(6, three, pairHigh, 0, 0, 0);
        uint8[5] memory desc = _descending(count, 0, 0);
        if (flush) return _pack(5, desc[0], desc[1], desc[2], desc[3], desc[4]);
        if (straightHigh > 0) return _pack(4, straightHigh, 0, 0, 0, 0);
        if (three > 0) { uint8[5] memory k = _descending(count, three, 0); return _pack(3, three, k[0], k[1], 0, 0); }
        if (pairHigh > 0 && pairLow > 0) return _pack(2, pairHigh, pairLow, _highestExcept(count, pairHigh, pairLow), 0, 0);
        if (pairHigh > 0) { uint8[5] memory k2 = _descending(count, pairHigh, 0); return _pack(1, pairHigh, k2[0], k2[1], k2[2], 0); }
        return _pack(0, desc[0], desc[1], desc[2], desc[3], desc[4]);
    }

    function _straightHigh(uint8[15] memory count) private pure returns (uint8) {
        uint8 run;
        for (uint8 r = 2; r <= 14; ++r) { run = count[r] > 0 ? run + 1 : 0; if (run >= 5) return r; }
        if (count[14] > 0 && count[2] > 0 && count[3] > 0 && count[4] > 0 && count[5] > 0) return 5;
        return 0;
    }

    function _descending(uint8[15] memory count, uint8 skip1, uint8 skip2) private pure returns (uint8[5] memory out) {
        uint256 n;
        for (uint8 r = 14; r >= 2 && n < 5; --r) { if (r != skip1 && r != skip2 && count[r] > 0) out[n++] = r; if (r == 2) break; }
    }

    function _highestExcept(uint8[15] memory count, uint8 skip1, uint8 skip2) private pure returns (uint8) {
        for (uint8 r = 14; r >= 2; --r) { if (r != skip1 && r != skip2 && count[r] > 0) return r; if (r == 2) break; }
        return 0;
    }

    function _pack(uint8 cat, uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) private pure returns (uint256) {
        return (((((uint256(cat) * BASE + a) * BASE + b) * BASE + c) * BASE + d) * BASE + e);
    }
}
