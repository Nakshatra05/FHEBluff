const hre=require('hardhat');
async function main(){
  const network=await hre.ethers.provider.getNetwork();
  if(network.chainId!==421614n)throw new Error('Readiness release requires Arbitrum Sepolia');
  const [signer]=await hre.ethers.getSigners();
  if(!signer)throw new Error('Configure a deployment signer locally first');
  const game=await(await hre.ethers.getContractFactory('FHEBluffReady',signer)).deploy();
  await game.waitForDeployment();
  const receipt=await game.deploymentTransaction().wait();
  console.log(JSON.stringify({contract:'FHEBluffReady',address:await game.getAddress(),chainId:421614,deploymentBlock:receipt.blockNumber}));
}
main().catch(()=>{console.error('Readiness deployment failed. Check the local signer, network and funding; no frontend configuration was changed.');process.exitCode=1;});
