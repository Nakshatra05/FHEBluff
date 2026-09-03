import Link from 'next/link';
import { ArrowUpRight, EyeOff, LockKeyhole, ShieldCheck, Spade } from 'lucide-react';

const steps = [
  ['01', 'SEAT', 'Connect with Privy and claim a seat at an open table.'],
  ['02', 'DEAL', 'CoFHE computes card state while every hole card stays encrypted.'],
  ['03', 'PLAY', 'Betting is public. Your hand is visible only to your wallet.'],
  ['04', 'SETTLE', 'The chain verifies settlement and permanently records Credits.'],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-cream text-ink">
      <nav className="mx-auto flex max-w-7xl items-center justify-between border-x-3 border-b-3 border-ink bg-cream px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tight">
          <span className="grid size-10 place-items-center border-3 border-ink bg-acid shadow-hard-sm"><Spade className="size-5 fill-current" /></span>
          FHEBLUFF
        </Link>
        <div className="hidden items-center gap-8 text-sm font-bold uppercase md:flex">
          <a href="#how">How it works</a><a href="#privacy">Privacy</a><a href="#tech">Network</a>
        </div>
        <Link href="/play" className="brutal-button bg-pink px-4 py-2 text-sm">ENTER APP <ArrowUpRight className="size-4" /></Link>
      </nav>

      <section className="relative mx-auto grid max-w-7xl border-x-3 border-ink px-4 py-14 sm:px-8 lg:grid-cols-[1.2fr_.8fr] lg:py-24">
        <div className="relative z-10">
          <div className="mb-7 inline-flex rotate-[-2deg] items-center gap-2 border-3 border-ink bg-white px-4 py-2 text-xs font-black uppercase shadow-hard-sm">
            <span className="size-2.5 animate-pulse rounded-full bg-green" /> Live on Arbitrum Sepolia
          </div>
          <h1 className="max-w-4xl text-[clamp(4rem,10vw,8.5rem)] font-black uppercase leading-[.78] tracking-[-.075em]">
            Private<br /><span className="text-pink">cards.</span><br />Public game.
          </h1>
          <p className="mt-8 max-w-xl text-lg font-semibold leading-relaxed sm:text-xl">
            Texas Hold’em where bets are transparent, results are verifiable, and your hole cards stay encrypted with Fhenix CoFHE.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/play" className="brutal-button bg-acid px-7 py-4 text-base">ENTER APP <ArrowUpRight /></Link>
            <a href="#privacy" className="brutal-button bg-white px-7 py-4 text-base">HOW PRIVACY WORKS</a>
          </div>
        </div>
        <div className="relative mt-20 min-h-[360px] lg:mt-0">
          <div className="absolute left-[5%] top-[22%] h-64 w-44 -rotate-12 border-4 border-ink bg-white p-4 shadow-hard-lg sm:left-[18%] sm:h-80 sm:w-56">
            <div className="text-4xl font-black">A♠</div><LockKeyhole className="mx-auto mt-14 size-20 text-pink sm:mt-20" /><div className="mt-10 text-right text-4xl font-black">♠A</div>
          </div>
          <div className="absolute right-[3%] top-[5%] h-64 w-44 rotate-12 border-4 border-ink bg-purple p-4 shadow-hard-lg sm:right-[12%] sm:h-80 sm:w-56">
            <div className="text-4xl font-black text-white">K♥</div><EyeOff className="mx-auto mt-14 size-20 text-acid sm:mt-20" /><div className="mt-10 text-right text-4xl font-black text-white">♥K</div>
          </div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rotate-2 border-3 border-ink bg-acid px-5 py-3 font-mono text-xs font-bold shadow-hard-sm">0x9f…e31 // ENCRYPTED</div>
        </div>
      </section>

      <section id="how" className="border-y-3 border-ink bg-purple py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <p className="eyebrow text-acid">THE HAND, ONCHAIN</p>
          <h2 className="section-title max-w-3xl">Poker without the peek.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([n, title, copy]) => <article key={n} className="border-3 border-ink bg-cream p-5 text-ink shadow-hard"><div className="mb-8 font-mono text-sm font-black text-purple">/{n}</div><h3 className="text-3xl font-black">{title}</h3><p className="mt-3 font-semibold leading-relaxed">{copy}</p></article>)}
          </div>
        </div>
      </section>

      <section id="privacy" className="mx-auto grid max-w-7xl border-x-3 border-ink lg:grid-cols-2">
        <div className="border-b-3 border-ink bg-pink p-8 sm:p-14 lg:border-b-0 lg:border-r-3">
          <ShieldCheck className="size-16" /><p className="eyebrow mt-16">COFHE PRIVACY</p><h2 className="section-title">The chain can compute what it cannot see.</h2>
        </div>
        <div className="space-y-7 p-8 sm:p-14">
          <p className="text-2xl font-black leading-tight">Your cards enter the contract as ciphertext handles—not plaintext values.</p>
          <p className="text-lg font-semibold leading-relaxed">The Fhenix coprocessor evaluates encrypted operations offchain. Onchain access control grants each player’s wallet permission to decrypt only their own hand.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {['No card values in events','Wallet-scoped access','Threshold decryption','Public betting state'].map((x)=><div key={x} className="flex items-center gap-3 border-3 border-ink bg-white p-4 font-bold shadow-hard-sm"><span className="grid size-7 place-items-center bg-green">✓</span>{x}</div>)}
          </div>
        </div>
      </section>

      <section id="tech" className="border-t-3 border-ink bg-acid py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 sm:px-8 lg:flex-row lg:items-end">
          <div><p className="eyebrow">READY TO ANTE UP?</p><h2 className="section-title max-w-3xl">One point per win. Zero cards leaked.</h2><p className="mt-5 max-w-2xl text-lg font-semibold">Credits are permanent reputation—not tokens, not money. Climb the global board one verified hand at a time.</p></div>
          <Link href="/play" className="brutal-button shrink-0 bg-ink px-8 py-5 text-white">ENTER FHEBLUFF <ArrowUpRight /></Link>
        </div>
      </section>
      <footer className="border-t-3 border-ink bg-ink px-4 py-6 text-center font-mono text-xs font-bold uppercase tracking-wider text-white">FHEBLUFF · COFHE 0.7 · ARBITRUM SEPOLIA · CREDITS HAVE NO MONETARY VALUE</footer>
    </main>
  );
}
