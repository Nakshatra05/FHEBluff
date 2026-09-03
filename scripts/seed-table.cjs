const hre = require('hardhat');

async function main() {
  const address = process.env.FHEBLUFF_CONTRACT_ADDRESS;
  if (!address) throw new Error('FHEBLUFF_CONTRACT_ADDRESS is required');
  const game = await hre.ethers.getContractAt('FHEBluff', address);
  const existing = await game.tableCount();
  if (existing > 0n) { console.log(`Table already exists (count: ${existing})`); return; }
  const tx = await game.createTable(6, 10, 1000);
  await tx.wait();
  console.log('Created Table #0: six-max, blinds 10/20, minimum buy-in 1000');
}
main().catch((error)=>{ console.error(error); process.exitCode=1; });
