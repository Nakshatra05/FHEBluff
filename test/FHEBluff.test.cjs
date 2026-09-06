const { expect } = require('chai');
const hre = require('hardhat');
const { Encryptable, FheTypes } = require('@cofhe/sdk');

describe('FHEBluff', function () {
  this.timeout(180000);

  async function deal(game, players, values = []) {
    const address = await game.getAddress();
    const clients = [];
    for (let i = 0; i < players.length; i++) {
      const client = await hre.cofhe.createClientWithBatteries(players[i]);
      clients.push(client);
      const [handle, proof] = await client.encryptInputs([Encryptable.uint128(BigInt(values[i] ?? i + 1))]).setConsumingContract(address).execute();
      await game.connect(players[i]).submitEntropy(0, handle, proof);
    }
    while ((await game.getShuffleProgress(0)) > 0n) await game.advanceShuffle(0, 2);
    return clients;
  }

  async function revealPublic(client, handles) {
    const results = await Promise.all(handles.map((handle) => client.decryptForTx(handle).withoutACP().execute()));
    return [results.map((result) => Number(result.decryptedValue)), results.map((result) => result.signature)];
  }
  it('enforces seating, host start, and turn guards', async function () {
    const [host, alice, outsider] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    await game.createTable(6, 10, 1000);
    await game.connect(host).joinTable(0, 1000);
    await game.connect(alice).joinTable(0, 1000);
    await expect(game.connect(outsider).startHand(0)).to.be.revertedWithCustomError(game, 'Unauthorized');
    await game.startHand(0);
    await expect(game.connect(host).act(0, 0, 0)).to.be.revertedWithCustomError(game, 'InvalidPhase');
    const view = await game.getTableView(0);
    expect(view[5]).to.equal(1n);
  });

  it('grants decryption only to the ciphertext owner', async function () {
    const [alice, bob] = await hre.ethers.getSigners();
    const vault = await (await hre.ethers.getContractFactory('ConfidentialCardHarness')).deploy();
    const address = await vault.getAddress();
    const aliceClient = await hre.cofhe.createClientWithBatteries(alice);
    const bobClient = await hre.cofhe.createClientWithBatteries(bob);
    const [handle, proof] = await aliceClient.encryptInputs([Encryptable.uint8(51n)]).setConsumingContract(address).execute();
    await vault.connect(alice).store(handle, proof);
    const stored = await vault.handleOf(alice.address);
    expect(await aliceClient.decryptForView(stored, FheTypes.Uint8).execute()).to.equal(51n);
    await expect(bobClient.decryptForView(stored, FheTypes.Uint8).execute()).to.be.rejected;
  });

  it('deals a unique encrypted deck from multi-party entropy', async function () {
    const [alice, bob] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    const address = await game.getAddress();
    await game.createTable(2, 10, 1000);
    await game.connect(alice).joinTable(0, 1000);
    await game.connect(bob).joinTable(0, 1000);
    await game.startHand(0);
    const aliceClient = await hre.cofhe.createClientWithBatteries(alice);
    const bobClient = await hre.cofhe.createClientWithBatteries(bob);
    const [a, aProof] = await aliceClient.encryptInputs([Encryptable.uint128(111n)]).setConsumingContract(address).execute();
    const [b, bProof] = await bobClient.encryptInputs([Encryptable.uint128(222n)]).setConsumingContract(address).execute();
    await game.connect(alice).submitEntropy(0, a, aProof);
    await game.connect(bob).submitEntropy(0, b, bProof);
    expect(await game.getShuffleProgress(0)).to.equal(9n);
    while ((await game.getShuffleProgress(0)) > 0n) await game.advanceShuffle(0, 1);
    const aliceHandles = await game.connect(alice).getMyHoleCards(0);
    const bobHandles = await game.connect(bob).getMyHoleCards(0);
    const cards = [
      await aliceClient.decryptForView(aliceHandles[0], FheTypes.Uint8).execute(),
      await aliceClient.decryptForView(aliceHandles[1], FheTypes.Uint8).execute(),
      await bobClient.decryptForView(bobHandles[0], FheTypes.Uint8).execute(),
      await bobClient.decryptForView(bobHandles[1], FheTypes.Uint8).execute(),
    ];
    expect(new Set(cards.map(String)).size).to.equal(4);
    await expect(bobClient.decryptForView(aliceHandles[0], FheTypes.Uint8).execute()).to.be.rejected;
  });

  it('reassigns a departed host and abandons an empty table', async function () {
    const [host, alice] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    await game.createTable(2, 10, 1000);
    await game.connect(host).joinTable(0, 1000);
    await game.connect(alice).joinTable(0, 1000);
    await game.connect(host).leaveTable(0);
    expect((await game.getTableView(0))[0]).to.equal(alice.address);
    await game.connect(alice).leaveTable(0);
    expect((await game.getTableView(0))[5]).to.equal(8n);
  });

  it('recovers a stalled encrypted deal and lets the host remove a disconnected seat', async function () {
    const [host, alice, outsider] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    await game.createTable(2, 10, 1000);
    await game.connect(host).joinTable(0, 1000);
    await game.connect(alice).joinTable(0, 1000);
    await game.startHand(0);
    await expect(game.abortStalledHand(0)).to.be.revertedWith('not timed out');
    await hre.network.provider.send('evm_increaseTime', [601]);
    await hre.network.provider.send('evm_mine');
    await game.connect(outsider).abortStalledHand(0);
    expect((await game.getTableView(0))[5]).to.equal(0n);
    await expect(game.connect(outsider).removePlayer(0, alice.address)).to.be.revertedWithCustomError(game, 'Unauthorized');
    await game.removePlayer(0, alice.address);
    expect((await game.getTableView(0))[4]).to.equal(1n);
  });

  it('settles an uncontested pot once and awards only the winner', async function () {
    const [host, alice] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    await game.createTable(2, 10, 1000);
    await game.connect(host).joinTable(0, 1000);
    await game.connect(alice).joinTable(0, 1000);
    await game.startHand(0);
    await deal(game, [host, alice]);
    const actingSeat = Number((await game.getTableView(0))[9]);
    const seats = await game.getSeats(0);
    const actor = seats[0][actingSeat] === host.address ? host : alice;
    const winner = actor.address === host.address ? alice : host;
    await game.connect(actor).act(0, 0, 0);
    expect((await game.getTableView(0))[5]).to.equal(7n);
    expect(await game.credits(winner.address)).to.equal(1n);
    expect(await game.credits(actor.address)).to.equal(0n);
    await expect(game.connect(actor).act(0, 0, 0)).to.be.revertedWithCustomError(game, 'InvalidPhase');
  });

  it('runs multiple all-ins through public streets, side pots, and showdown without losing chips', async function () {
    const [host, alice, bob] = await hre.ethers.getSigners();
    const players = [host, alice, bob];
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    await game.createTable(3, 10, 1000);
    await game.connect(host).joinTable(0, 1000);
    await game.connect(alice).joinTable(0, 1500);
    await game.connect(bob).joinTable(0, 2000);
    await game.startHand(0);
    const clients = await deal(game, players, [111, 222, 333]);

    for (let turn = 0; turn < 3; turn++) {
      const view = await game.getTableView(0);
      const seats = await game.getSeats(0);
      const actorAddress = seats[0][Number(view[9])];
      const actor = players.find((player) => player.address === actorAddress);
      await game.connect(actor).act(0, 4, 0);
    }
    expect((await game.getTableView(0))[5]).to.equal(3n);

    const boardHandles = await game.getCommunityHandles(0);
    expect(boardHandles.length).to.equal(5);
    const [boardValues, boardSignatures] = await revealPublic(clients[0], boardHandles);
    await game.publishCommunity(0, boardValues, boardSignatures);
    expect((await game.getTableView(0))[5]).to.equal(6n);
    await expect(game.publishCommunity(0, boardValues, boardSignatures)).to.be.revertedWithCustomError(game, 'BadReveal');

    const showdownHandles = await game.getShowdownHandles(0);
    const [values, signatures] = await revealPublic(clients[0], showdownHandles);
    await game.settleShowdown(0, values, signatures);
    const seats = await game.getSeats(0);
    expect(seats[1].reduce((total, stack) => total + stack, 0n)).to.equal(4500n);
    expect((await game.getTableView(0))[5]).to.equal(7n);
    expect((await game.leaderboard(10))[0].length).to.be.greaterThan(0);
    await expect(game.settleShowdown(0, values, signatures)).to.be.revertedWithCustomError(game, 'InvalidPhase');
  });

  it('deals in one atomic batch, preserves card ACLs, and settles an expired turn', async function () {
    const [host, guest, outsider] = await hre.ethers.getSigners();
    const game = await (await hre.ethers.getContractFactory('FHEBluff')).deploy();
    const router = await (await hre.ethers.getContractFactory('DealBatchHarness')).deploy();
    await game.createTable(2,5,500);
    await game.joinTable(0,500);await game.connect(guest).joinTable(0,500);await game.startHand(0);
    const clients=[];
    for(const player of [host,guest]){
      const client=await hre.cofhe.createClientWithBatteries(player);clients.push(client);
      const [handle,proof]=await client.encryptInputs([Encryptable.uint128(BigInt(clients.length))]).setConsumingContract(await game.getAddress()).execute();
      await game.connect(player).submitEntropy(0,handle,proof);
    }
    const calls=[4,4,1].map(steps=>({target:game.target,allowFailure:false,callData:game.interface.encodeFunctionData('advanceShuffle',[0,steps])}));
    await expect(router.aggregate3([...calls,calls[0]],{gasLimit:100000000})).to.be.reverted;
    expect(await game.getShuffleProgress(0)).to.equal(9n); // Whole failed batch rolls back.
    await router.connect(outsider).aggregate3(calls,{gasLimit:100000000});
    expect((await game.getTableView(0))[5]).to.equal(2n);
    const hole=await game.getMyHoleCards(0);
    expect(await clients[0].decryptForView(hole[0],FheTypes.Uint8).execute()).to.be.lessThan(52n);
    await expect(clients[1].decryptForView(hole[0],FheTypes.Uint8).execute()).to.be.rejected;
    await expect(game.forceTimeoutFold(0)).to.be.revertedWith('not timed out');
    await hre.network.provider.send('evm_increaseTime',[121]);await hre.network.provider.send('evm_mine');
    await game.connect(outsider).forceTimeoutFold(0);
    expect((await game.getTableView(0))[5]).to.equal(7n);
    const seats=await game.getSeats(0);expect(seats[1].reduce((a,b)=>a+b,0n)).to.equal(1000n);
    expect((await game.credits(host.address))+(await game.credits(guest.address))).to.equal(1n);
    await expect(game.forceTimeoutFold(0)).to.be.revertedWithCustomError(game,'InvalidPhase');
  });
});
