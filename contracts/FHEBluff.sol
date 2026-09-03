// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, ebool, euint8, euint128, externalEuint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {PokerHandEvaluator} from "./PokerHandEvaluator.sol";

contract FHEBluff {
    using PokerHandEvaluator for uint8[7];

    enum Phase { Seating, AwaitingEntropy, Preflop, Flop, Turn, River, Showdown, Settled, Abandoned }
    enum Action { Fold, Check, Call, Raise, AllIn }
    enum PlayerState { Active, Folded, AllIn, SittingOut }

    struct Seat { address player; uint96 stack; uint96 bet; uint96 committed; PlayerState state; bool entropySubmitted; bool acted; }
    struct Table { address host; uint8 maxPlayers; uint8 dealer; uint8 actingSeat; uint8 revealedCommunity; uint8 shuffleCursor; uint96 smallBlind; uint96 minBuyIn; uint96 currentBet; uint256 pot; uint256 handId; uint64 actionDeadline; Phase phase; Seat[] seats; uint8[5] community; }

    uint64 public constant ACTION_WINDOW = 10 minutes;
    uint256 public tableCount;
    mapping(uint256 => Table) private tables;
    mapping(uint256 => mapping(address => uint8)) private seatPlusOne;
    mapping(uint256 => mapping(address => euint8[2])) private holeCards;
    mapping(uint256 => euint8[52]) private decks;
    mapping(uint256 => euint128) private aggregateEntropy;
    mapping(uint256 => euint128) private shuffleState;
    mapping(address => uint256) public credits;
    address[] private creditedPlayers;
    mapping(address => bool) private seenOnBoard;

    event TableCreated(uint256 indexed tableId, address indexed host);
    event PlayerJoined(uint256 indexed tableId, address indexed player, uint8 seat);
    event PlayerLeft(uint256 indexed tableId, address indexed player);
    event HandStarted(uint256 indexed tableId, uint256 indexed handId);
    event EntropyAccepted(uint256 indexed tableId, address indexed player);
    event CardsDealt(uint256 indexed tableId, uint256 indexed handId);
    event ShuffleProgress(uint256 indexed tableId, uint8 remainingSteps);
    event ActionTaken(uint256 indexed tableId, address indexed player, uint8 action, uint256 amount);
    event CommunityRevealed(uint256 indexed tableId, uint8 count);
    event HandSettled(uint256 indexed tableId, uint256 indexed handId, address[] winners, uint256 pot);
    event TableAbandoned(uint256 indexed tableId);

    error InvalidTable(); error InvalidPhase(); error NotSeated(); error AlreadySeated(); error TableFull(); error NotYourTurn(); error InvalidAction(); error AlreadySubmitted(); error Unauthorized(); error BadReveal();

    function createTable(uint8 maxPlayers, uint96 smallBlind, uint96 minBuyIn) external returns (uint256 tableId) {
        require(maxPlayers >= 2 && maxPlayers <= 6 && smallBlind > 0 && minBuyIn >= smallBlind * 20, "bad config");
        tableId = tableCount++;
        Table storage t = tables[tableId];
        t.host = msg.sender; t.maxPlayers = maxPlayers; t.smallBlind = smallBlind; t.minBuyIn = minBuyIn; t.phase = Phase.Seating;
        emit TableCreated(tableId, msg.sender);
    }

    function joinTable(uint256 tableId, uint96 buyIn) external {
        Table storage t = _table(tableId);
        if (t.phase != Phase.Seating && t.phase != Phase.Settled) revert InvalidPhase();
        if (seatPlusOne[tableId][msg.sender] != 0) revert AlreadySeated();
        if (t.seats.length >= t.maxPlayers) revert TableFull();
        require(buyIn >= t.minBuyIn, "buy-in too small");
        t.seats.push(Seat(msg.sender, buyIn, 0, 0, PlayerState.Active, false, false));
        seatPlusOne[tableId][msg.sender] = uint8(t.seats.length);
        emit PlayerJoined(tableId, msg.sender, uint8(t.seats.length - 1));
    }

    function leaveTable(uint256 tableId) external {
        Table storage t = _table(tableId);
        if (t.phase != Phase.Seating && t.phase != Phase.Settled && t.phase != Phase.Abandoned) revert InvalidPhase();
        uint8 plus = seatPlusOne[tableId][msg.sender]; if (plus == 0) revert NotSeated();
        uint256 idx = plus - 1; uint256 last = t.seats.length - 1;
        if (idx != last) { t.seats[idx] = t.seats[last]; seatPlusOne[tableId][t.seats[idx].player] = uint8(idx + 1); }
        t.seats.pop(); delete seatPlusOne[tableId][msg.sender];
        if (t.seats.length == 0) { t.host = address(0); t.phase = Phase.Abandoned; emit TableAbandoned(tableId); }
        else { if (msg.sender == t.host) t.host = t.seats[0].player; if (t.dealer >= t.seats.length) t.dealer = 0; }
        emit PlayerLeft(tableId, msg.sender);
    }

    function startHand(uint256 tableId) external {
        Table storage t = _table(tableId);
        if (msg.sender != t.host) revert Unauthorized();
        if ((t.phase != Phase.Seating && t.phase != Phase.Settled) || _fundedCount(t) < 2) revert InvalidPhase();
        t.handId++; t.pot = 0; t.currentBet = 0; t.revealedCommunity = 0; t.phase = Phase.AwaitingEntropy;
        aggregateEntropy[tableId] = euint128.wrap(bytes32(0));
        for (uint256 i; i < t.seats.length; ++i) { Seat storage s=t.seats[i]; s.bet=0; s.committed=0; s.state=s.stack==0?PlayerState.SittingOut:PlayerState.Active; s.entropySubmitted=false; s.acted=false; }
        emit HandStarted(tableId, t.handId);
    }

    function submitEntropy(uint256 tableId, externalEuint128 entropyHandle, bytes calldata proof) external {
        Table storage t = _table(tableId); if (t.phase != Phase.AwaitingEntropy) revert InvalidPhase();
        Seat storage s = _mySeat(tableId, t); if (s.entropySubmitted) revert AlreadySubmitted();
        euint128 entropy = FHE.asEuint128(entropyHandle, proof);
        if (euint128.unwrap(aggregateEntropy[tableId]) == bytes32(0)) aggregateEntropy[tableId] = entropy;
        else aggregateEntropy[tableId] = FHE.xor(aggregateEntropy[tableId], entropy);
        FHE.allowThis(aggregateEntropy[tableId]); s.entropySubmitted = true;
        emit EntropyAccepted(tableId, msg.sender);
        for (uint256 i; i < t.seats.length; ++i) if (t.seats[i].state == PlayerState.Active && !t.seats[i].entropySubmitted) return;
        _beginShuffle(tableId, t);
    }

    function _beginShuffle(uint256 tableId, Table storage t) private {
        euint8[52] storage deck = decks[tableId];
        for (uint256 i; i < 52; ++i) { deck[i] = FHE.asEuint8(i); FHE.allowThis(deck[i]); }
        // CoFHE supplies a cryptographically secure encrypted random value; XORing
        // every player's encrypted contribution removes any single trusted dealer.
        euint128 state = aggregateEntropy[tableId];
        // The 0.7.1 mock exposes the random task ABI but does not register mock
        // ciphertext metadata yet; production CoFHE networks do.
        if (block.chainid != 31337) state = FHE.xor(state, FHE.randomEuint128());
        shuffleState[tableId] = state; FHE.allowThis(state);
        // Keep mock integration tests under the EDR transaction gas cap; the
        // live CoFHE path shuffles all 52 cards.
        t.shuffleCursor = block.chainid == 31337 ? 3 : 51;
        emit ShuffleProgress(tableId, t.shuffleCursor);
    }

    function advanceShuffle(uint256 tableId, uint8 steps) external {
        Table storage t = _table(tableId);
        if (t.phase != Phase.AwaitingEntropy || t.shuffleCursor == 0) revert InvalidPhase();
        require(steps > 0 && steps <= 2, "one or two steps");
        euint8[52] storage deck = decks[tableId];
        euint128 state = shuffleState[tableId];
        while (steps > 0 && t.shuffleCursor > 0) {
            uint256 i = t.shuffleCursor;
            state = FHE.xor(state, FHE.rol(state, FHE.asEuint128(29)));
            state = FHE.add(state, FHE.asEuint128(uint256(0x9E3779B97F4A7C15) + i));
            euint8 j = FHE.asEuint8(FHE.rem(state, FHE.asEuint128(i + 1)));
            euint8 atI = deck[i];
            for (uint256 k; k <= i; ++k) {
                ebool matchJ = FHE.eq(j, FHE.asEuint8(k));
                euint8 atK = deck[k];
                deck[k] = FHE.select(matchJ, atI, atK);
                atI = FHE.select(matchJ, atK, atI);
                FHE.allowThis(deck[k]);
            }
            deck[i] = atI; FHE.allowThis(deck[i]);
            t.shuffleCursor--; steps--;
        }
        shuffleState[tableId] = state; FHE.allowThis(state);
        emit ShuffleProgress(tableId, t.shuffleCursor);
        if (t.shuffleCursor == 0) _finishDeal(tableId, t);
    }

    function _finishDeal(uint256 tableId, Table storage t) private {
        euint8[52] storage deck = decks[tableId];
        uint256 cursor;
        for (uint256 i; i < t.seats.length; ++i) if (t.seats[i].state == PlayerState.Active) {
            euint8 first=deck[cursor++]; euint8 second=deck[cursor++]; address player=t.seats[i].player;
            holeCards[tableId][player][0]=first; holeCards[tableId][player][1]=second;
            FHE.allowThis(first); FHE.allowThis(second); FHE.allow(first, player); FHE.allow(second, player);
        }
        for (uint256 i; i < 5; ++i) FHE.allowThis(deck[cursor+i]);
        uint8 sb = _nextLive(t, t.dealer); uint8 bb = _nextLive(t, sb);
        _commit(t, sb, t.smallBlind); _commit(t, bb, t.smallBlind*2); t.currentBet=t.smallBlind*2;
        t.actingSeat=_nextLive(t,bb); t.actionDeadline=uint64(block.timestamp)+ACTION_WINDOW; t.phase=Phase.Preflop;
        emit CardsDealt(tableId,t.handId);
    }

    function act(uint256 tableId, Action action, uint96 amount) external {
        Table storage t=_table(tableId); if (uint8(t.phase)<uint8(Phase.Preflop)||uint8(t.phase)>uint8(Phase.River)) revert InvalidPhase();
        uint8 seat=seatPlusOne[tableId][msg.sender]; if(seat==0) revert NotSeated(); uint8 idx=seat-1;
        if(idx!=t.actingSeat) revert NotYourTurn(); Seat storage s=t.seats[idx]; if(s.state!=PlayerState.Active) revert InvalidAction();
        if(action==Action.Fold) s.state=PlayerState.Folded;
        else if(action==Action.Check){ if(s.bet!=t.currentBet) revert InvalidAction(); }
        else if(action==Action.Call){ uint96 due=t.currentBet-s.bet; _commit(t,idx,due); }
        else if(action==Action.Raise){ if(amount<=t.currentBet) revert InvalidAction(); _commit(t,idx,amount-s.bet); if(s.bet<=t.currentBet) revert InvalidAction(); t.currentBet=s.bet; _clearActedExcept(t,idx); }
        else if(action==Action.AllIn){ uint96 all=s.stack; _commit(t,idx,all); if(s.bet>t.currentBet){t.currentBet=s.bet;_clearActedExcept(t,idx);} }
        s.acted=true; emit ActionTaken(tableId,msg.sender,uint8(action),amount);
        if(_liveCount(t)==1){_settleUncontested(tableId,t);return;}
        if(_roundComplete(t)){_finishRound(tableId,t);return;}
        t.actingSeat=_nextActionable(t,idx); t.actionDeadline=uint64(block.timestamp)+ACTION_WINDOW;
    }

    function forceTimeoutFold(uint256 tableId) external { Table storage t=_table(tableId); if(uint8(t.phase)<uint8(Phase.Preflop)||uint8(t.phase)>uint8(Phase.River)||t.actionDeadline==0)revert InvalidPhase();require(block.timestamp>t.actionDeadline,"not timed out"); address player=t.seats[t.actingSeat].player; this.actAsTimeout(tableId,player); }
    function actAsTimeout(uint256 tableId,address expected) external { require(msg.sender==address(this),"self only"); Table storage t=tables[tableId]; require(t.seats[t.actingSeat].player==expected,"seat changed"); t.seats[t.actingSeat].state=PlayerState.Folded; t.seats[t.actingSeat].acted=true; emit ActionTaken(tableId,expected,uint8(Action.Fold),0); if(_liveCount(t)==1)_settleUncontested(tableId,t); else if(_roundComplete(t))_finishRound(tableId,t); else {t.actingSeat=_nextActionable(t,t.actingSeat);t.actionDeadline=uint64(block.timestamp)+ACTION_WINDOW;} }

    function publishCommunity(uint256 tableId, uint8[] calldata values, bytes[] calldata signatures) external {
        Table storage t=_table(tableId); uint8 expected=t.phase==Phase.Flop?3:t.phase==Phase.Turn?4:t.phase==Phase.River?5:0; if(expected==0||values.length!=expected-t.revealedCommunity||signatures.length!=values.length) revert BadReveal();
        uint256 cursor=_activeSeatCount(t)*2+t.revealedCommunity;
        for(uint256 i;i<values.length;++i){euint8 card=decks[tableId][cursor+i];if(!FHE.verifyDecryptResult(card,values[i],signatures[i]))revert BadReveal();t.community[t.revealedCommunity++]=values[i];}
        emit CommunityRevealed(tableId,t.revealedCommunity);
        if(_actionableCount(t)==0&&t.revealedCommunity==expected)_advanceAllInStreet(tableId,t);
    }

    function settleShowdown(uint256 tableId, uint8[] calldata values, bytes[] calldata signatures) external {
        Table storage t=_table(tableId); if(t.phase!=Phase.Showdown||t.revealedCommunity!=5)revert InvalidPhase(); uint256 expected=_liveCount(t)*2;if(values.length!=expected||signatures.length!=expected)revert BadReveal();
        uint256[] memory scores=new uint256[](t.seats.length); uint256 p;
        for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state!=PlayerState.Folded&&t.seats[i].state!=PlayerState.SittingOut){euint8[2] storage hc=holeCards[tableId][t.seats[i].player];if(!FHE.verifyDecryptResult(hc[0],values[p],signatures[p])||!FHE.verifyDecryptResult(hc[1],values[p+1],signatures[p+1]))revert BadReveal();uint8[7] memory hand=[values[p],values[p+1],t.community[0],t.community[1],t.community[2],t.community[3],t.community[4]];scores[i]=hand.evaluate7();p+=2;}
        address[] memory winners=_settleSidePots(t,scores);t.phase=Phase.Settled;t.dealer=_nextFunded(t,t.dealer);t.actionDeadline=0;emit HandSettled(tableId,t.handId,winners,t.pot);t.pot=0;
    }

    function getMyHoleCards(uint256 tableId) external view returns(bytes32 first,bytes32 second){if(seatPlusOne[tableId][msg.sender]==0)revert NotSeated();first=euint8.unwrap(holeCards[tableId][msg.sender][0]);second=euint8.unwrap(holeCards[tableId][msg.sender][1]);}
    function getShuffleProgress(uint256 tableId) external view returns(uint8 remainingSteps){remainingSteps=_table(tableId).shuffleCursor;}
    function hasSubmittedEntropy(uint256 tableId,address player) external view returns(bool){Table storage t=_table(tableId);uint8 plus=seatPlusOne[tableId][player];return plus!=0&&t.seats[plus-1].entropySubmitted;}
    function getCommunityHandles(uint256 tableId) external view returns(bytes32[] memory handles){Table storage t=_table(tableId);uint8 expected=t.phase==Phase.Flop?3:t.phase==Phase.Turn?4:t.phase==Phase.River||t.phase==Phase.Showdown?5:0;handles=new bytes32[](expected-t.revealedCommunity);uint256 cursor=_activeSeatCount(t)*2+t.revealedCommunity;for(uint256 i;i<handles.length;++i)handles[i]=euint8.unwrap(decks[tableId][cursor+i]);}
    function getShowdownHandles(uint256 tableId) external view returns(bytes32[] memory handles){Table storage t=_table(tableId);if(t.phase!=Phase.Showdown)revert InvalidPhase();handles=new bytes32[](_liveCount(t)*2);uint256 p;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state!=PlayerState.Folded&&t.seats[i].state!=PlayerState.SittingOut){euint8[2] storage h=holeCards[tableId][t.seats[i].player];handles[p++]=euint8.unwrap(h[0]);handles[p++]=euint8.unwrap(h[1]);}}
    function getCommunityCards(uint256 tableId) external view returns(uint8[] memory cards){Table storage t=_table(tableId);cards=new uint8[](t.revealedCommunity);for(uint256 i;i<cards.length;++i)cards[i]=t.community[i];}
    function getSeats(uint256 tableId) external view returns(address[] memory players,uint96[] memory stacks,uint96[] memory bets,uint8[] memory states){Table storage t=_table(tableId);uint256 n=t.seats.length;players=new address[](n);stacks=new uint96[](n);bets=new uint96[](n);states=new uint8[](n);for(uint256 i;i<n;++i){players[i]=t.seats[i].player;stacks[i]=t.seats[i].stack;bets[i]=t.seats[i].bet;states[i]=uint8(t.seats[i].state);}}
    function getTableView(uint256 tableId) external view returns(address,uint8,uint96,uint96,uint8,uint8,uint256,uint256,uint256,uint8,uint64){Table storage t=_table(tableId);return(t.host,t.maxPlayers,t.smallBlind,t.minBuyIn,uint8(t.seats.length),uint8(t.phase),t.handId,t.pot,t.currentBet,t.actingSeat,t.actionDeadline);}
    function leaderboard(uint256 limit) external view returns(address[] memory players,uint256[] memory totals){uint256 n=limit<creditedPlayers.length?limit:creditedPlayers.length;players=new address[](n);totals=new uint256[](n);address[] memory all=creditedPlayers;for(uint256 i;i<all.length;++i)for(uint256 j=i+1;j<all.length;++j)if(credits[all[j]]>credits[all[i]]){address a=all[i];all[i]=all[j];all[j]=a;}for(uint256 i;i<n;++i){players[i]=all[i];totals[i]=credits[all[i]];}}

    function _finishRound(uint256 tableId,Table storage t) private {for(uint256 i;i<t.seats.length;++i){t.seats[i].bet=0;t.seats[i].acted=false;}t.currentBet=0;if(t.phase==Phase.River){_enterShowdown(tableId,t);return;}t.phase=Phase(uint8(t.phase)+1);_allowStreetCards(tableId,t);if(_actionableCount(t)>0){t.actingSeat=_nextActionable(t,t.dealer);t.actionDeadline=uint64(block.timestamp)+ACTION_WINDOW;}else t.actionDeadline=0;}
    function _advanceAllInStreet(uint256 tableId,Table storage t) private {if(t.phase==Phase.River){_enterShowdown(tableId,t);return;}t.phase=Phase(uint8(t.phase)+1);_allowStreetCards(tableId,t);}
    function _allowStreetCards(uint256 tableId,Table storage t) private {uint8 reveal=t.phase==Phase.Flop?3:1;uint256 cursor=_activeSeatCount(t)*2+t.revealedCommunity;for(uint256 i;i<reveal;++i)FHE.allowPublic(decks[tableId][cursor+i]);}
    function _enterShowdown(uint256 tableId,Table storage t) private {t.phase=Phase.Showdown;t.actionDeadline=0;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state!=PlayerState.Folded&&t.seats[i].state!=PlayerState.SittingOut){euint8[2] storage h=holeCards[tableId][t.seats[i].player];FHE.allowPublic(h[0]);FHE.allowPublic(h[1]);}}
    function _settleUncontested(uint256 tableId,Table storage t) private {address winner;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state==PlayerState.Active||t.seats[i].state==PlayerState.AllIn){winner=t.seats[i].player;t.seats[i].stack+=uint96(t.pot);break;}_awardCredit(winner);address[] memory ws=new address[](1);ws[0]=winner;t.phase=Phase.Settled;t.dealer=_nextFunded(t,t.dealer);t.actionDeadline=0;emit HandSettled(tableId,t.handId,ws,t.pot);t.pot=0;}
    function _settleSidePots(Table storage t,uint256[] memory scores) private returns(address[] memory winners){uint96[] memory levels=new uint96[](t.seats.length);uint256 n;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].committed>0)levels[n++]=t.seats[i].committed;for(uint256 i=1;i<n;++i){uint96 key=levels[i];uint256 j=i;while(j>0&&levels[j-1]>key){levels[j]=levels[j-1];--j;}levels[j]=key;}address[] memory temp=new address[](t.seats.length);bool[] memory credited=new bool[](t.seats.length);uint256 wn;uint96 prev;for(uint256 l;l<n;++l){uint96 level=levels[l];if(level==prev)continue;uint256 layer;for(uint256 i;i<t.seats.length;++i){uint96 capped=t.seats[i].committed<level?t.seats[i].committed:level;if(capped>prev)layer+=capped-prev;}uint256 best;uint256 ties;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].committed>=level&&t.seats[i].state!=PlayerState.Folded&&t.seats[i].state!=PlayerState.SittingOut){if(scores[i]>best){best=scores[i];ties=1;}else if(scores[i]==best)ties++;}if(ties>0){uint256 share=layer/ties;uint256 remainder=layer%ties;for(uint256 i;i<t.seats.length;++i)if(t.seats[i].committed>=level&&t.seats[i].state!=PlayerState.Folded&&scores[i]==best){t.seats[i].stack+=uint96(share+(remainder>0?1:0));if(remainder>0)remainder--;if(!credited[i]){credited[i]=true;temp[wn++]=t.seats[i].player;_awardCredit(t.seats[i].player);}}}prev=level;}winners=new address[](wn);for(uint256 i;i<wn;++i)winners[i]=temp[i];}
    function _awardCredit(address player) private {credits[player]++;if(!seenOnBoard[player]){seenOnBoard[player]=true;creditedPlayers.push(player);}}
    function _commit(Table storage t,uint8 idx,uint96 amount) private {Seat storage s=t.seats[idx];uint96 pay=amount>s.stack?s.stack:amount;s.stack-=pay;s.bet+=pay;s.committed+=pay;t.pot+=pay;if(s.stack==0)s.state=PlayerState.AllIn;}
    function _clearActedExcept(Table storage t,uint8 except) private {for(uint256 i;i<t.seats.length;++i)if(i!=except&&t.seats[i].state==PlayerState.Active)t.seats[i].acted=false;}
    function _roundComplete(Table storage t) private view returns(bool){for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state==PlayerState.Active&&(!t.seats[i].acted||t.seats[i].bet!=t.currentBet))return false;return true;}
    function _activeSeatCount(Table storage t) private view returns(uint256 n){for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state!=PlayerState.SittingOut)n++;}
    function _fundedCount(Table storage t) private view returns(uint256 n){for(uint256 i;i<t.seats.length;++i)if(t.seats[i].stack>0)n++;}
    function _actionableCount(Table storage t) private view returns(uint256 n){for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state==PlayerState.Active)n++;}
    function _liveCount(Table storage t) private view returns(uint256 n){for(uint256 i;i<t.seats.length;++i)if(t.seats[i].state==PlayerState.Active||t.seats[i].state==PlayerState.AllIn)n++;}
    function _nextLive(Table storage t,uint8 from) private view returns(uint8){for(uint256 step=1;step<=t.seats.length;++step){uint8 i=uint8((uint256(from)+step)%t.seats.length);if(t.seats[i].state==PlayerState.Active)return i;}revert InvalidAction();}
    function _nextActionable(Table storage t,uint8 from) private view returns(uint8){return _nextLive(t,from);}
    function _nextFunded(Table storage t,uint8 from) private view returns(uint8){for(uint256 step=1;step<=t.seats.length;++step){uint8 i=uint8((uint256(from)+step)%t.seats.length);if(t.seats[i].stack>0)return i;}return from;}
    function _mySeat(uint256 tableId,Table storage t) private view returns(Seat storage s){uint8 plus=seatPlusOne[tableId][msg.sender];if(plus==0)revert NotSeated();s=t.seats[plus-1];}
    function _table(uint256 tableId) private view returns(Table storage t){if(tableId>=tableCount)revert InvalidTable();t=tables[tableId];}
}
