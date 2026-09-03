const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying FHEBluff from ${deployer.address}`);
  const factory = await hre.ethers.getContractFactory('FHEBluff');
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  console.log(`FHEBluff deployed to ${await contract.getAddress()}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
