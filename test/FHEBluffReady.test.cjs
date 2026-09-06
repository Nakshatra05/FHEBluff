const {expect}=require('chai');
const hre=require('hardhat');
const {Encryptable,FheTypes}=require('@cofhe/sdk');

describe('FHEBluffReady preparation gate',function(){
  this.timeout(180000);
  async function setup(){
    const [a,b,outsider]=await hre.ethers.getSigners();
    const game=await(await hre.ethers.getContractFactory('FHEBluffReady')).deploy();
    await game.createTable(2,5,500);await game.joinTable(0,500);await game.connect(b).joinTable(0,500);
    const clients=await Promise.all([a,b].map(p=>hre.cofhe.createClientWithBatteries(p)));
    async function deal(){
      await game.startHand(0);
      for(let i=0;i<2;i++){
        const [handle,proof]=await clients[i].encryptInputs([Encryptable.uint128(BigInt(i+1))]).setConsumingContract(await game.getAddress()).execute();
        await game.connect([a,b][i]).submitEntropy(0,handle,proof);
      }
      // Local mocks execute FHE synchronously; use the established small test batches.
      while(await game.getShuffleProgress(0)>0n)await game.advanceShuffle(0,2);
    }
    await deal();return {game,a,b,outsider,clients,deal};
  }
  it('keeps chips untouched and both private hands accessible before betting',async()=>{
    const {game,a,b,outsider,clients}=await setup();
    const view=await game.getTableView(0);expect(view[5]).eq(9n);expect(view[7]).eq(0n);expect(view[8]).eq(0n);
    expect((await game.getSeats(0))[1]).deep.eq([500n,500n]);
    for(let i=0;i<2;i++){
      const handles=await game.connect([a,b][i]).getMyHoleCards(0);
      expect(await clients[i].decryptForView(handles[0],FheTypes.Uint8).execute()).lessThan(52n);
      await expect(clients[1-i].decryptForView(handles[0],FheTypes.Uint8).execute()).rejected;
    }
    await expect(game.act(0,0,0)).revertedWithCustomError(game,'InvalidPhase');
    await expect(game.forceTimeoutFold(0)).revertedWithCustomError(game,'InvalidPhase');
    await expect(game.connect(outsider).confirmCardsReady(0,1)).revertedWithCustomError(game,'NotSeated');
    await game.confirmCardsReady(0,1);
    expect((await game.getTableView(0))[10]).eq(view[10]);
    await expect(game.confirmCardsReady(0,1)).revertedWithCustomError(game,'AlreadySubmitted');
    expect((await game.getTableView(0))[7]).eq(0n);
    await game.connect(b).confirmCardsReady(0,1);
    const started=await game.getTableView(0);expect(started[5]).eq(2n);expect(started[7]).eq(15n);
    const block=await hre.ethers.provider.getBlock('latest');expect(started[10]).eq(BigInt(block.timestamp+120));
    await expect(game.confirmCardsReady(0,1)).revertedWithCustomError(game,'InvalidPhase');
  });
  it('allows both players to opt in and act without first decrypting cards',async()=>{
    const {game,a,b}=await setup();
    await game.confirmCardsReady(0,1);
    expect((await game.getTableView(0))[5]).eq(9n);
    await game.connect(b).confirmCardsReady(0,1);
    const view=await game.getTableView(0);
    expect(view[5]).eq(2n);expect(view[7]).eq(15n);
    await game.connect([a,b][Number(view[9])]).act(0,2,0);
    expect((await game.getTableView(0))[7]).eq(20n);
  });
  it('expires without chip penalties or Credits and rejects stale acknowledgements',async()=>{
    const {game,b,outsider,deal}=await setup();
    await game.confirmCardsReady(0,1);
    await expect(game.abortStalledHand(0)).revertedWith('not timed out');
    await hre.network.provider.send('evm_increaseTime',[301]);await hre.network.provider.send('evm_mine');
    await expect(game.connect(b).confirmCardsReady(0,1)).revertedWith('preparation expired');
    await game.connect(outsider).abortStalledHand(0);
    expect((await game.getSeats(0))[1]).deep.eq([500n,500n]);
    expect((await game.leaderboard(10))[0].length).eq(0);
    await expect(game.abortStalledHand(0)).revertedWithCustomError(game,'InvalidPhase');
    await deal();expect(await game.isPlayerReady(0,b.address)).eq(false);
    await expect(game.confirmCardsReady(0,1)).revertedWithCustomError(game,'InvalidPhase');
    await game.confirmCardsReady(0,2);await game.connect(b).confirmCardsReady(0,2);
    expect((await game.getTableView(0))[5]).eq(2n);
  });
});
