'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { createConfig, WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'wagmi';
import { fallback } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useState } from 'react';

const config = createConfig({
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: fallback([
      http(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', { timeout: 8_000 }),
      http('https://arbitrum-sepolia.drpc.org'),
    ]),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmth0jykz00ly0di0ehde6wdy';
  return (
    <PrivyProvider appId={appId} config={{
      appearance: { theme: 'light', accentColor: '#6647f5', logo: undefined },
      supportedChains: [arbitrumSepolia],
      defaultChain: arbitrumSepolia,
      embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
    }}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
