const hre=require('hardhat');
async function main(){
  if((await hre.ethers.provider.getNetwork()).chainId!==421614n)throw new Error('Wrong chain');
  const game=await(await hre.ethers.getContractFactory('FHEBluffInstant')).deploy();
  await game.waitForDeployment();const receipt=await game.deploymentTransaction().wait();
  console.log(JSON.stringify({contract:'FHEBluffInstant',address:await game.getAddress(),chainId:421614,deploymentBlock:receipt.blockNumber}));
}
main().catch(()=>{console.error('Deployment failed; no frontend configuration changed.');process.exitCode=1;});
