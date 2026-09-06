const {expect}=require('chai');
const hre=require('hardhat');
const {Encryptable,FheTypes}=require('@cofhe/sdk');
describe('FHEBluffInstant',function(){
  this.timeout(180000);
  it('starts betting during deal completion, preserves private ACLs and rejects duplicate readiness',async()=>{
    const [a,b,outsider]=await hre.ethers.getSigners();
    const game=await(await hre.ethers.getContractFactory('FHEBluffInstant')).deploy();
    await game.createTable(2,5,500);await game.joinTable(0,500);await game.connect(b).joinTable(0,500);await game.startHand(0);
    const clients=await Promise.all([a,b].map(p=>hre.cofhe.createClientWithBatteries(p)));
    for(let i=0;i<2;i++){
      const [handle,proof]=await clients[i].encryptInputs([Encryptable.uint128(BigInt(i+1))]).setConsumingContract(await game.getAddress()).execute();
      await game.connect([a,b][i]).submitEntropy(0,handle,proof);
    }
    while(await game.getShuffleProgress(0)>0n)await game.advanceShuffle(0,2);
    const view=await game.getTableView(0);expect(view[5]).eq(2n);expect(view[7]).eq(15n);
    const block=await hre.ethers.provider.getBlock('latest');expect(view[10]).eq(BigInt(block.timestamp+120));
    await expect(game.confirmCardsReady(0,1)).revertedWithCustomError(game,'InvalidPhase');
    const actor=Number(view[9]);await expect(game.connect([a,b][1-actor]).act(0,2,0)).revertedWithCustomError(game,'NotYourTurn');
    await expect(game.connect(outsider).act(0,2,0)).revertedWithCustomError(game,'NotSeated');
    await game.connect([a,b][actor]).act(0,2,0);expect((await game.getTableView(0))[7]).eq(20n);
    for(let i=0;i<2;i++){
      const handles=await game.connect([a,b][i]).getMyHoleCards(0);
      expect(await clients[i].decryptForView(handles[0],FheTypes.Uint8).execute()).lessThan(52n);
      await expect(clients[1-i].decryptForView(handles[0],FheTypes.Uint8).execute()).rejected;
    }
    await game.connect([a,b][Number((await game.getTableView(0))[9])]).act(0,1,0);
    for(let stage=3;stage<=5;stage++){
      expect((await game.getTableView(0))[5]).eq(BigInt(stage));
      expect((await game.getTableView(0))[10]).eq(0n);
      await hre.network.provider.send('evm_increaseTime',[180]);await hre.network.provider.send('evm_mine');
      await expect(game.forceTimeoutFold(0)).revertedWithCustomError(game,'InvalidPhase');
      const handles=await game.getCommunityHandles(0);
      const proofs=await Promise.all(handles.map(h=>clients[0].decryptForTx(h).withoutACP().execute()));
      await game.publishCommunity(0,proofs.map(p=>p.decryptedValue),proofs.map(p=>p.signature));
      const published=await hre.ethers.provider.getBlock('latest');
      const deadline=(await game.getTableView(0))[10];expect(deadline).eq(BigInt(published.timestamp+120));
      await expect(game.publishCommunity(0,[],[])).revertedWithCustomError(game,'BadReveal');
      expect((await game.getTableView(0))[10]).eq(deadline);
      if(stage<5)for(let move=0;move<2;move++)await game.connect([a,b][Number((await game.getTableView(0))[9])]).act(0,1,0);
    }
    await game.connect([a,b][Number((await game.getTableView(0))[9])]).act(0,0,0);
    expect((await game.getTableView(0))[5]).eq(7n);
    await expect(game.act(0,0,0)).revertedWithCustomError(game,'InvalidPhase');
  });
});
