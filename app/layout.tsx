import type { Metadata } from 'next';
import { Archivo_Black, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const display = Archivo_Black({ variable: '--font-display', subsets: ['latin'], weight: '400' });
const sans = Space_Grotesk({ variable: '--font-sans-custom', subsets: ['latin'] });
const mono = IBM_Plex_Mono({ variable: '--font-mono-custom', subsets: ['latin'], weight: ['500','700'] });

export const metadata: Metadata = { title: 'FHEBluff — Private Onchain Poker', description: 'Private cards. Public game. Multiplayer Texas Hold’em with Fhenix CoFHE on Arbitrum Sepolia.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${sans.variable} ${mono.variable}`}><Providers>{children}</Providers></body></html>;
}
