require('dotenv/config');
require('@nomicfoundation/hardhat-toolbox');
require('@cofhe/hardhat-plugin');

module.exports = {
  solidity: { version: '0.8.28', settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, viaIR: true } },
  cofhe: { logMocks: false, gasWarning: false },
  sourcify: { enabled: true },
  networks: {
    // Match the compiled EVM target. CoFHE mocks perform work synchronously and
    // need more gas than live coprocessor task scheduling; do not use mock gas
    // measurements as a production transaction budget.
    hardhat: { hardfork: 'cancun', blockGasLimit: 1_000_000_000 },
    'arb-sepolia': {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
