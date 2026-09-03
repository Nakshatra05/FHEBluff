'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWalletClient, useWriteContract } from 'wagmi';
import { Encryptable, FheTypes } from '@cofhe/sdk';
import { Activity, ArrowLeft, Coins, Crown, Eye, EyeOff, LockKeyhole, Plus, Radio, ShieldCheck, Spade, Trophy, Users, WalletCards, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTIONS, fheBluffAbi, PHASES } from '@/lib/fhebluff-abi';
import { ARBITRUM_SEPOLIA_CHAIN_ID, POKER_ADDRESS } from '@/lib/network';
import { cofheClient } from '@/lib/cofhe-client';

type TableView = readonly [`0x${string}`, number, bigint, bigint, number, number, bigint, bigint, bigint, number, bigint];
type AppView = 'tables'|'active'|'credits'|'leaderboard'|'privacy';
const short = (v?: string) => v ? `${v.slice(0,6)}…${v.slice(-4)}` : '—';
const number = (v: bigint | number | undefined) => Number(v || 0);

export default function PokerApp() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const contractReady = /^0x[a-fA-F0-9]{40}$/.test(POKER_ADDRESS);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [appView, setAppView] = useState<AppView>('tables');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [smallBlind, setSmallBlind] = useState(10);
  const [minBuyIn, setMinBuyIn] = useState(1000);
  const { data: tableCount, refetch: refreshCount } = useReadContract({ address: POKER_ADDRESS, abi: fheBluffAbi, functionName:'tableCount', query:{ enabled:contractReady } });
  const ids = useMemo(() => Array.from({ length: Math.min(number(tableCount), 24) }, (_,i)=>BigInt(i)), [tableCount]);
  const { data: tables, refetch: refreshTables } = useReadContracts({ contracts: ids.map(id=>({ address:POKER_ADDRESS, abi:fheBluffAbi, functionName:'getTableView' as const, args:[id] })) });
  const { data: creditData } = useReadContract({ address:POKER_ADDRESS, abi:fheBluffAbi, functionName:'credits', args: address ? [address] : undefined, query:{ enabled:contractReady && !!address } });
  const { data:leaderData } = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'leaderboard',args:[100n],query:{enabled:contractReady,refetchInterval:15000}});
  const { writeContract, data:txHash, isPending, error } = useWriteContract();
  const [submissionError,setSubmissionError] = useState('');
  const { isLoading:isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash:txHash });

  useEffect(()=>{ if(isSuccess){ void refreshCount(); void refreshTables(); } },[isSuccess, refreshCount, refreshTables]);
  useEffect(()=>{
    const context = typeof document === 'undefined' ? undefined : (document as Document & {modelContext?: {registerTool:(tool:unknown, opts?:unknown)=>void}}).modelContext;
    if(!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { context.registerTool({ name:'open_fhebluff_table', title:'Open FHEBluff table', description:'Open an existing onchain poker table by numeric table ID.', inputSchema:{type:'object',properties:{tableId:{type:'integer',minimum:0}},required:['tableId'],additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input:unknown)=>{ const id=(input as {tableId:number}).tableId; if(!Number.isInteger(id)||id<0) throw new Error('Invalid table ID'); setSelected(BigInt(id)); return {tableId:id,opened:true}; } }, {signal:lifecycle.signal}); } catch {}
    return ()=>lifecycle.abort();
  },[]);

  const wrongNetwork = authenticated && chainId !== ARBITRUM_SEPOLIA_CHAIN_ID;
  const transact = async (functionName:'createTable'|'joinTable'|'leaveTable'|'startHand'|'act'|'forceTimeoutFold'|'abortStalledHand', args:readonly unknown[]) => {
    if(!authenticated) { login(); return; }
    if(wrongNetwork) { switchChain({chainId:ARBITRUM_SEPOLIA_CHAIN_ID}); return; }
    try {
      setSubmissionError('');
      const fees=await publicClient?.estimateFeesPerGas({type:'eip1559'});
      const buffered=fees?{maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}:{};
      writeContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args,...buffered} as never);
    } catch(e) { setSubmissionError(e instanceof Error?e.message:'Could not prepare current network fees'); }
  };
  const createTable = () => transact('createTable',[maxPlayers,BigInt(smallBlind),BigInt(minBuyIn)]);
  const rows = (tables || []).map((entry,i)=>({ id:ids[i], data:entry.status==='success' ? entry.result as TableView : null })).filter(x=>x.data);
  const activeRows = rows.filter(({data})=>data && number(data[5])>0 && number(data[5])<7);
  const titles:Record<AppView,[string,string]>={tables:['ONCHAIN LOBBY','Pick your poison.'],active:['LIVE HANDS','Action is onchain.'],credits:['PLAYER PROFILE','Your reputation.'],leaderboard:['GLOBAL CREDITS','Top the table.'],privacy:['COFHE PRIVACY','Encrypted by design.']};

  return (
    <main className="min-h-screen bg-[#ece7d7] text-ink">
      <header className="sticky top-0 z-40 border-b-3 border-ink bg-cream">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3"><button onClick={()=>window.location.assign('/')} aria-label="Back to landing page" className="grid size-10 place-items-center border-3 border-ink bg-white shadow-hard-sm"><ArrowLeft className="size-5" /></button><div className="flex items-center gap-2 font-black"><Spade className="size-6 fill-current" /> <span className="hidden sm:inline">FHEBLUFF</span></div></div>
          <div className="hidden items-center gap-2 border-3 border-ink bg-white px-3 py-2 font-mono text-xs font-bold md:flex"><span className="size-2.5 rounded-full bg-green" /> ARBITRUM SEPOLIA · 421614</div>
          <div className="flex items-center gap-2">
            {authenticated && <button onClick={()=>setAppView('credits')} className="hidden border-3 border-ink bg-acid px-3 py-2 text-sm font-black sm:block">{number(creditData)} CR</button>}
            {!ready ? <div className="h-11 w-32 animate-pulse border-3 border-ink bg-white" /> : authenticated ? <button onClick={()=>logout()} className="brutal-button bg-purple px-3 py-2 text-sm text-white"><WalletCards className="size-4" />{short(address)}</button> : <button onClick={login} className="brutal-button bg-pink px-4 py-2 text-sm">CONNECT</button>}
          </div>
        </div>
      </header>

      {wrongNetwork && <button onClick={()=>switchChain({chainId:ARBITRUM_SEPOLIA_CHAIN_ID})} className="flex w-full items-center justify-center gap-2 border-b-3 border-ink bg-pink px-4 py-3 font-black">WRONG NETWORK — SWITCH TO ARBITRUM SEPOLIA <Radio className="size-4" /></button>}
      {(isPending || isConfirming || isSuccess || error || submissionError) && <div className={`fixed bottom-4 right-4 z-50 max-w-sm border-3 border-ink p-4 font-bold shadow-hard ${error||submissionError?'bg-pink':isSuccess?'bg-green':'bg-acid'}`}>{submissionError?`Transaction preparation failed: ${submissionError}`:error ? `Transaction failed: ${error.message.split('\n')[0]}` : isSuccess ? 'Transaction confirmed onchain.' : isConfirming ? 'Confirming on Arbitrum Sepolia…' : 'Check your wallet to continue.'}</div>}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-3 sm:p-6 xl:grid-cols-[230px_1fr]">
        <aside className="hidden self-start border-3 border-ink bg-ink p-4 text-white shadow-hard xl:block">
          <p className="eyebrow text-acid">COMMAND DECK</p>
          <div className="mt-7 space-y-2">{([['tables','Lobby',Users],['active','Active hands',Activity],['credits','Credits',Coins],['leaderboard','Leaderboard',Trophy]] as const).map(([value,label,Icon])=><button onClick={()=>setAppView(value)} key={label} className={`flex w-full items-center gap-3 border-2 border-white/30 px-3 py-3 text-left font-bold ${appView===value?'bg-acid text-ink':''}`}><Icon className="size-5" />{label}</button>)}</div>
          <div className="mt-10 border-2 border-acid p-4"><LockKeyhole className="size-8 text-acid"/><p className="mt-4 font-black">YOUR CARDS, YOUR KEYS.</p><p className="mt-2 text-sm text-white/70">CoFHE ACPs scope decryption to the seated wallet.</p></div>
        </aside>

        <section className="min-w-0">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="eyebrow text-purple">{titles[appView][0]}</p><h1 className="font-heading text-4xl uppercase leading-none sm:text-6xl">{titles[appView][1]}</h1></div>
            <Dialog><DialogTrigger render={<button className="brutal-button bg-acid px-5 py-3"><Plus /> CREATE TABLE</button>} /><DialogContent className="border-3 border-ink bg-cream shadow-hard-lg sm:max-w-md"><DialogHeader><DialogTitle className="font-heading text-3xl uppercase">Create a table</DialogTitle><DialogDescription className="font-semibold text-ink/70">Set the seats and play-chip stakes. Credits are reputation only.</DialogDescription></DialogHeader><div className="space-y-5 pt-3"><Field label="Seats"><select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))} className="input-brutal"><option value="2">Heads-up · 2</option><option value="4">Four-max · 4</option><option value="6">Six-max · 6</option></select></Field><Field label="Small blind"><input className="input-brutal" type="number" min="1" value={smallBlind} onChange={e=>setSmallBlind(Number(e.target.value))}/></Field><Field label="Minimum buy-in"><input className="input-brutal" type="number" min="20" value={minBuyIn} onChange={e=>setMinBuyIn(Number(e.target.value))}/></Field><button disabled={!contractReady||isPending} onClick={createTable} className="brutal-button w-full bg-purple px-5 py-4 text-white disabled:opacity-40">{!authenticated?'CONNECT TO CREATE':wrongNetwork?'SWITCH NETWORK':'CREATE ONCHAIN'}</button></div></DialogContent></Dialog>
          </div>

          <Tabs value={appView} onValueChange={value=>setAppView(value as AppView)}>
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-3 border-ink bg-white p-1 shadow-hard-sm sm:inline-grid sm:w-auto"><TabsTrigger value="tables" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black sm:px-5 sm:text-sm data-[state=active]:bg-pink">OPEN TABLES</TabsTrigger><TabsTrigger value="leaderboard" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black sm:px-5 sm:text-sm data-[state=active]:bg-acid">LEADERBOARD</TabsTrigger><TabsTrigger value="privacy" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black sm:px-5 sm:text-sm data-[state=active]:bg-green">PRIVACY</TabsTrigger></TabsList>
            <TabsContent value="tables" className="mt-5">
              {!contractReady ? <Empty icon={X} title="CONTRACT NOT CONFIGURED" body="Set NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS to the deployed Arbitrum Sepolia contract. No demo tables are substituted for chain state." /> : rows.length===0 ? <Empty icon={Spade} title="THE FELT IS QUIET" body="No tables exist yet. Connect a wallet and create the first verifiable game." /> : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{rows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)} />)}</div>}
            </TabsContent>
            <TabsContent value="active" className="mt-5">{activeRows.length===0?<Empty icon={Activity} title="NO ACTIVE HANDS" body="Hands in progress will appear here with their current street and pot."/>:<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{activeRows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)}/>)}</div>}</TabsContent>
            <TabsContent value="credits" className="mt-5"><Profile address={address} credits={number(creditData)} authenticated={authenticated} login={login}/></TabsContent>
            <TabsContent value="leaderboard" className="mt-5"><Leaderboard address={address} data={leaderData as readonly [readonly `0x${string}`[],readonly bigint[]]|undefined} /></TabsContent>
            <TabsContent value="privacy" className="mt-5"><PrivacyPanel /></TabsContent>
          </Tabs>
        </section>
      </div>
      {selected!==null && <GameTable id={selected} address={address} close={()=>setSelected(null)} transact={transact} />}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t-3 border-ink bg-cream xl:hidden">{([['tables',Users,'Lobby'],['active',Activity,'Hands'],['credits',Coins,'Credits'],['leaderboard',Trophy,'Ranks']] as const).map(([value,Icon,label])=><button onClick={()=>setAppView(value)} key={value} className={`grid min-h-16 place-items-center text-[11px] font-black ${appView===value?'bg-acid':''}`}><Icon className="size-5" />{label}</button>)}</nav>
    </main>
  );
}

function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="block"><span className="mb-1 block font-mono text-xs font-bold uppercase">{label}</span>{children}</label>}
function Empty({icon:Icon,title,body}:{icon:typeof Spade,title:string,body:string}){return <div className="border-3 border-ink bg-white p-8 text-center shadow-hard sm:p-14"><Icon className="mx-auto size-14"/><h2 className="mt-5 font-heading text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-lg font-semibold text-ink/65">{body}</p></div>}

function TableCard({id,data,onOpen}:{id:bigint,data:TableView,onOpen:()=>void}){
  return <article className="group border-3 border-ink bg-white p-5 shadow-hard transition-transform hover:-translate-y-1"><div className="flex items-start justify-between"><span className="border-2 border-ink bg-purple px-2 py-1 font-mono text-xs font-bold text-white">TABLE #{id.toString()}</span><span className="flex items-center gap-1 text-xs font-bold"><span className="size-2 rounded-full bg-green"/>{PHASES[number(data[5])]||'UNKNOWN'}</span></div><h3 className="mt-7 text-2xl font-black">{number(data[4])}/{number(data[1])} PLAYERS</h3><div className="mt-5 grid grid-cols-2 gap-2 font-mono text-xs"><div className="border-2 border-ink bg-cream p-3"><span className="block opacity-55">BLINDS</span>{number(data[2])}/{number(data[2])*2}</div><div className="border-2 border-ink bg-cream p-3"><span className="block opacity-55">BUY-IN</span>{number(data[3])} CHIPS</div></div><button onClick={onOpen} className="brutal-button mt-5 w-full bg-pink py-3">OPEN TABLE</button></article>
}

function Leaderboard({address,data}:{address?:string,data?:readonly[readonly `0x${string}`[],readonly bigint[]]}){const players=data?.[0]||[];const totals=data?.[1]||[];return <div className="border-3 border-ink bg-white shadow-hard"><div className="flex items-center justify-between border-b-3 border-ink bg-acid p-5"><h2 className="font-heading text-3xl">CREDITS BOARD</h2><Crown/></div><div className="space-y-3 p-4 sm:p-5">{players.length===0?<p className="border-3 border-dashed border-ink p-8 text-center font-black">NO COMPLETED HANDS YET</p>:players.map((player,i)=><div key={player} className={`grid grid-cols-[42px_1fr_auto] items-center gap-3 border-3 border-ink p-3 sm:grid-cols-[56px_1fr_auto] sm:p-4 ${player.toLowerCase()===address?.toLowerCase()?'bg-green':'bg-cream'}`}><span className="font-heading text-2xl">#{i+1}</span><span className="min-w-0 truncate font-mono text-xs font-bold sm:text-sm">{short(player)}{player.toLowerCase()===address?.toLowerCase()?' · YOU':''}</span><strong>{number(totals[i])} CR</strong></div>)}<p className="pt-2 text-sm font-semibold text-ink/60">Read directly from the contract. Every tied winner receives one non-transferable Credit.</p></div></div>}
function Profile({address,credits,authenticated,login}:{address?:string,credits:number,authenticated:boolean,login:()=>void}){return <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><div className="border-3 border-ink bg-white p-6 shadow-hard"><div className="flex items-center gap-4"><div className="grid size-16 place-items-center border-3 border-ink bg-purple font-heading text-2xl text-white">{address?.slice(2,4).toUpperCase()||'?'}</div><div className="min-w-0"><p className="font-mono text-xs font-bold text-purple">CONNECTED PLAYER</p><h2 className="truncate font-heading text-2xl sm:text-3xl">{address?short(address):'NOT CONNECTED'}</h2></div></div><div className="mt-6 grid grid-cols-2 gap-3"><StatCard label="CREDITS" value={credits}/><StatCard label="NETWORK" value="ARB SEP"/></div>{!authenticated&&<button onClick={login} className="brutal-button mt-5 w-full bg-pink py-4">CONNECT PROFILE</button>}</div><div className="border-3 border-ink bg-acid p-6 shadow-hard"><Coins className="size-10"/><h3 className="mt-8 font-heading text-3xl">REPUTATION, NOT MONEY.</h3><p className="mt-3 font-semibold leading-relaxed">Credits persist across tables, cannot be transferred, and can only be awarded by contract settlement.</p></div></div>}
function StatCard({label,value}:{label:string,value:string|number}){return <div className="border-3 border-ink bg-cream p-4"><span className="font-mono text-xs font-bold opacity-55">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>}
function PrivacyPanel(){return <div className="grid gap-4 lg:grid-cols-3">{[[LockKeyhole,'ENCRYPTED DEAL','Players contribute encrypted entropy. Hole-card handles receive wallet-specific ACL grants.'],[EyeOff,'NO SIDE CHANNELS','Card values never appear in events, transaction logs, or public plaintext storage.'],[ShieldCheck,'VERIFIED REVEAL','Street and showdown reveals require threshold-network signatures verified by CoFHE.']].map(([Icon,t,b])=><div key={String(t)} className="border-3 border-ink bg-white p-6 shadow-hard"><Icon className="size-10 text-purple"/><h3 className="mt-8 text-xl font-black">{String(t)}</h3><p className="mt-3 font-semibold leading-relaxed text-ink/65">{String(b)}</p></div>)}</div>}

function GameTable({id,address,close,transact}:{id:bigint,address?:`0x${string}`,close:()=>void,transact:(name:'joinTable'|'leaveTable'|'startHand'|'act'|'forceTimeoutFold'|'abortStalledHand',args:readonly unknown[])=>void}){
  const [raise,setRaise]=useState(40);
  const [privateCards,setPrivateCards]=useState<number[]>([]);
  const [privacyStatus,setPrivacyStatus]=useState('');
  const [now,setNow]=useState(0);
  const publicClient=usePublicClient(); const {data:walletClient}=useWalletClient(); const {writeContract:writePrivate,data:privateTxHash,isPending:privatePending,error:privateError}=useWriteContract();
  const {isLoading:privateConfirming,isSuccess:privateSuccess}=useWaitForTransactionReceipt({hash:privateTxHash});
  const {data:view} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getTableView',args:[id],query:{refetchInterval:5000}});
  const {data:seatData} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getSeats',args:[id],query:{refetchInterval:5000}});
  const {data:community} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getCommunityCards',args:[id],query:{refetchInterval:5000}});
  const {data:shuffleRemaining} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getShuffleProgress',args:[id],query:{refetchInterval:3000}});
  const {data:entropySubmitted} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'hasSubmittedEntropy',args:address?[id,address]:undefined,query:{enabled:!!address,refetchInterval:3000}});
  useEffect(()=>{const tick=()=>setNow(Math.floor(Date.now()/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
  const table=view as TableView|undefined; const seats=seatData as readonly [`0x${string}`[],bigint[],bigint[],number[]]|undefined;
  const me=seats?.[0].findIndex(x=>x.toLowerCase()===address?.toLowerCase())??-1;
  const stage=PHASES[number(table?.[5])]||'LOADING';
  const timedOut=number(table?.[10])>0&&now>number(table?.[10]);
  const connectCofhe=async()=>{if(!publicClient||!walletClient)throw new Error('Connect a wallet first');await cofheClient.connect(publicClient as never,walletClient as never);};
  const freshPrivateWrite=async(request:Parameters<typeof writePrivate>[0])=>{if(!publicClient)throw new Error('Network client unavailable');const fees=await publicClient.estimateFeesPerGas({type:'eip1559'});writePrivate({...request,maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas} as never);};
  const advanceEncryptedShuffle=async()=>{try{setPrivacyStatus('Preparing current network fee…');await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'advanceShuffle',args:[id,2]});setPrivacyStatus('Shuffle step ready. Confirm in your wallet.');}catch(e){setPrivacyStatus(e instanceof Error?e.message:'Could not prepare the shuffle transaction');}};
  const submitEncryptedEntropy=async()=>{try{setPrivacyStatus('Generating private entropy and ZK proof…');await connectCofhe();const words=new BigUint64Array(2);crypto.getRandomValues(words);const entropy=(words[0]<<64n)|words[1];const [handle,proof]=await cofheClient.encryptInputs([Encryptable.uint128(entropy)]).setConsumingContract(POKER_ADDRESS).execute();await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'submitEntropy',args:[id,handle,proof]});setPrivacyStatus('Encrypted entropy ready. Confirm in your wallet.');}catch(e){setPrivacyStatus(e instanceof Error?e.message:'Encryption failed');}};
  const decryptMine=async()=>{try{setPrivacyStatus('Authorizing your card-only ACP…');await connectCofhe();await cofheClient.acp.getOrCreateSelfACP();const handles=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getMyHoleCards',args:[id],account:address});const cards=await Promise.all(handles.map(h=>cofheClient.decryptForView(h,FheTypes.Uint8).execute()));setPrivateCards(cards.map(Number));setPrivacyStatus('Cards decrypted locally. They were not published onchain.');}catch(e){setPrivacyStatus(e instanceof Error?e.message:'Decryption failed');}};
  const publishReveal=async(showdown=false)=>{try{setPrivacyStatus('Requesting threshold-signed reveal…');await connectCofhe();const functionName=showdown?'getShowdownHandles':'getCommunityHandles';const handles=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args:[id]}) as readonly `0x${string}`[];const revealed=await Promise.all(handles.map(h=>cofheClient.decryptForTx(h).withoutACP().execute()));await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:showdown?'settleShowdown':'publishCommunity',args:[id,revealed.map(x=>Number(x.decryptedValue)),revealed.map(x=>x.signature)]} as never);setPrivacyStatus('Reveal proof ready. Confirm the verification transaction.');}catch(e){setPrivacyStatus(e instanceof Error?e.message:'Reveal failed');}};
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#191917] text-white"><header className="sticky top-0 z-20 flex items-center justify-between border-b-3 border-white/25 bg-ink px-3 py-3 sm:px-6"><button onClick={close} className="flex items-center gap-2 font-black"><ArrowLeft/> LOBBY</button><div className="text-center"><p className="font-mono text-[10px] text-acid">TABLE #{id.toString()}</p><p className="font-black">{stage}</p></div><div className="border-2 border-acid px-3 py-2 font-mono text-xs">POT {number(table?.[7])}</div></header><div className="mx-auto grid min-h-[calc(100vh-68px)] max-w-7xl grid-rows-[auto_1fr_auto] gap-4 p-3 pb-28 sm:p-6">
    <div className="grid grid-cols-3 gap-2 text-center"><Stat label="CURRENT BET" value={number(table?.[8])}/><Stat label="YOUR STACK" value={me>=0?number(seats?.[1][me]):0}/><Stat label="HAND" value={`#${number(table?.[6])}`}/></div>
    <div className="relative grid min-h-[480px] place-items-center overflow-hidden border-3 border-acid bg-[#0f714c] p-3 shadow-[8px_8px_0_#d8ff3e] sm:rounded-[45%]">
      <div className="absolute inset-4 border-2 border-dashed border-white/25 sm:rounded-[45%]" />
      <div className="relative z-10 text-center"><p className="font-mono text-xs font-bold text-acid">{stage} · {table ? `SEAT ${number(table[9])+1} TO ACT` : 'SYNCING'}</p><div className="mt-5 flex justify-center gap-2">{Array.from({length:5},(_,i)=><PlayingCard key={i} value={community?.[i]}/>)}</div><div className="mt-6 inline-block border-3 border-ink bg-acid px-5 py-3 font-heading text-2xl text-ink">{number(table?.[7])} CHIPS</div></div>
      <div className="absolute inset-x-3 top-3 flex justify-center gap-3 sm:inset-x-24 sm:justify-between">{seats?.[0].slice(0,3).map((p,i)=><Seat key={p} player={p} stack={number(seats[1][i])} bet={number(seats[2][i])} state={seats[3][i]} active={number(table?.[9])===i}/>)}</div>
      <div className="absolute inset-x-3 bottom-3 flex justify-center gap-3 sm:inset-x-24 sm:justify-between">{seats?.[0].slice(3,6).map((p,j)=>{const i=j+3;return <Seat key={p} player={p} stack={number(seats[1][i])} bet={number(seats[2][i])} state={seats[3][i]} active={number(table?.[9])===i}/>})}</div>
    </div>
    <div className="sticky bottom-16 z-20 border-3 border-ink bg-cream p-3 text-ink shadow-hard sm:bottom-3"><div className="mb-3 flex items-center justify-between"><div className="flex gap-2"><PlayingCard value={privateCards[0]} hidden={privateCards.length===0}/><PlayingCard value={privateCards[1]} hidden={privateCards.length===0}/></div><div className="max-w-[60%] text-right"><p className="font-mono text-[10px] font-bold">PRIVATE HAND</p><p className="text-xs font-semibold text-purple"><LockKeyhole className="inline size-3"/> {privateCards.length?'DECRYPTED LOCALLY':'ACP LOCKED'}</p><p className="mt-1 truncate text-[10px] font-bold text-ink/55">{privateError?'Transaction failed':privateConfirming?'Confirming onchain…':privatePending?'Check your wallet…':privateSuccess?'Transaction confirmed.':privacyStatus}</p></div></div>{me<0 ? <button onClick={()=>transact('joinTable',[id,BigInt(table?.[3]||1000)])} className="brutal-button w-full bg-acid py-4">JOIN FOR {number(table?.[3])} CHIPS</button> : number(table?.[5])===0||number(table?.[5])===7 ? <div className="grid grid-cols-2 gap-2"><button onClick={()=>transact('leaveTable',[id])} className="brutal-button bg-white py-4">LEAVE TABLE</button>{address?.toLowerCase()===table?.[0]?.toLowerCase()&&number(table?.[4])>=2?<button onClick={()=>transact('startHand',[id])} className="brutal-button bg-pink py-4">START NEXT HAND</button>:<div className="grid place-items-center border-3 border-ink bg-white p-2 text-center text-xs font-black">WAITING FOR HOST</div>}</div> : number(table?.[5])===1 ? timedOut ? <button onClick={()=>transact('abortStalledHand',[id])} className="brutal-button w-full bg-pink py-4">RESET STALLED DEAL</button> : number(shuffleRemaining)>0 ? <div><p className="mb-2 text-center font-mono text-xs font-bold">ENCRYPTED SHUFFLE · {number(shuffleRemaining)}/51 STEPS REMAIN</p><button onClick={()=>void advanceEncryptedShuffle()} className="brutal-button w-full bg-acid py-4"><ShieldCheck/> ADVANCE PRIVATE SHUFFLE</button></div> : entropySubmitted ? <div className="border-3 border-ink bg-white p-4 text-center font-black">ENTROPY LOCKED · WAITING FOR OTHER PLAYERS</div> : <button onClick={submitEncryptedEntropy} className="brutal-button w-full bg-purple py-4 text-white"><LockKeyhole/> SUBMIT ENCRYPTED ENTROPY</button> : number(table?.[5])===6 ? <button onClick={()=>publishReveal(true)} className="brutal-button w-full bg-pink py-4"><ShieldCheck/> VERIFY & SETTLE SHOWDOWN</button> : <><div className="mb-2 grid grid-cols-2 gap-2"><button onClick={decryptMine} className="min-h-12 border-2 border-ink bg-white px-3 py-2 text-xs font-black"><Eye/> DECRYPT MY CARDS</button>{number(table?.[5])>=3&&number(table?.[5])<=5?<button onClick={()=>publishReveal(false)} className="min-h-12 border-2 border-ink bg-green px-3 py-2 text-xs font-black"><ShieldCheck/> PUBLISH STREET</button>:timedOut?<button onClick={()=>transact('forceTimeoutFold',[id])} className="min-h-12 border-2 border-ink bg-pink px-3 py-2 text-xs font-black">FORCE TIMEOUT FOLD</button>:<div className="grid place-items-center border-2 border-ink bg-white px-2 text-center font-mono text-[10px] font-bold">WAITING FOR ACTION</div>}</div><div className="grid grid-cols-3 gap-2 sm:grid-cols-6"><Action label="FOLD" color="bg-pink" onClick={()=>transact('act',[id,ACTIONS.FOLD,0n])}/><Action label="CHECK" onClick={()=>transact('act',[id,ACTIONS.CHECK,0n])}/><Action label="CALL" color="bg-green" onClick={()=>transact('act',[id,ACTIONS.CALL,0n])}/><input aria-label="Raise amount" type="number" value={raise} onChange={e=>setRaise(Number(e.target.value))} className="input-brutal min-w-0"/><Action label="RAISE" color="bg-acid" onClick={()=>transact('act',[id,ACTIONS.RAISE,BigInt(raise)])}/><Action label="ALL-IN" color="bg-purple text-white" onClick={()=>transact('act',[id,ACTIONS.ALL_IN,0n])}/></div></>}</div>
  </div></div>
}
function Stat({label,value}:{label:string,value:string|number}){return <div className="border-2 border-white/30 bg-black/30 p-2"><span className="block font-mono text-[9px] text-white/55">{label}</span><strong>{value}</strong></div>}
function PlayingCard({value,hidden}:{value?:number,hidden?:boolean}){const rank=value!==undefined?['2','3','4','5','6','7','8','9','10','J','Q','K','A'][value%13]:'?';const suit=value!==undefined?['♣','♦','♥','♠'][Math.floor(value/13)]:'◆';return <div className={`grid h-20 w-14 place-items-center border-3 border-ink text-xl font-black shadow-hard-sm sm:h-28 sm:w-20 ${hidden?'bg-purple text-acid':'bg-white text-ink'}`}>{hidden?<EyeOff/>:<span>{rank}{suit}</span>}</div>}
function Seat({player,stack,bet,state,active}:{player:string,stack:number,bet:number,state:number,active:boolean}){return <div className={`min-w-24 border-2 border-ink p-2 text-center text-ink ${active?'bg-acid':'bg-white'}`}><div className="mx-auto grid size-7 place-items-center rounded-full bg-purple text-xs font-black text-white">{player.slice(2,4)}</div><p className="mt-1 font-mono text-[9px]">{short(player)}</p><p className="text-xs font-black">{stack} · BET {bet}</p>{state>0&&<span className="text-[9px] font-bold text-pink">{['','FOLDED','ALL-IN','SITTING OUT'][state]}</span>}</div>}
function Action({label,color='bg-white',onClick}:{label:string,color?:string,onClick:()=>void}){return <button onClick={onClick} className={`min-h-12 border-3 border-ink px-2 font-black shadow-hard-sm ${color}`}>{label}</button>}
