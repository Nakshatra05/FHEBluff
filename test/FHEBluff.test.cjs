const { expect } = require('chai');
const hre = require('hardhat');
const { Encryptable, FheTypes } = require('@cofhe/sdk');

describe('FHEBluff', function () {
  this.timeout(180000);
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
});
