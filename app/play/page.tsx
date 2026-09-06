'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWalletClient, useWriteContract } from 'wagmi';
import { Encryptable, FheTypes } from '@cofhe/sdk';
import { decodeEventLog } from 'viem';
import { PracticeTable } from '@/components/poker/practice-table';
import { PlayLaunchpad } from '@/components/poker/play-launchpad';
import { TableGuide } from '@/components/poker/table-guide';
import { BettingControls } from '@/components/poker/betting-controls';
import { bestHand, HAND_NAMES } from '@/lib/practice-poker';
import { Activity, ArrowLeft, Coins, Crown, Eye, EyeOff, Flame, History, LockKeyhole, Plus, Radio, ShieldCheck, Sparkles, Spade, Swords, Target, Timer, Trophy, Users, Volume2, VolumeX, WalletCards, X, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTIONS, fheBluffAbi, PHASES } from '@/lib/fhebluff-abi';
import { ARBITRUM_SEPOLIA_CHAIN_ID, POKER_ADDRESS, POKER_DEPLOYMENT_BLOCK } from '@/lib/network';
import { cofheClient } from '@/lib/cofhe-client';

type TableView = readonly [`0x${string}`, number, bigint, bigint, number, number, bigint, bigint, bigint, number, bigint];
type AppView = 'tables'|'active'|'history'|'credits'|'leaderboard'|'privacy';
type HandResult = { tableId:bigint; handId:bigint; winners:readonly `0x${string}`[]; pot:bigint; transactionHash:`0x${string}` };
type ActionEntry = { player:`0x${string}`; action:number; amount:bigint; transactionHash:`0x${string}` };
const short = (v?: string) => v ? `${v.slice(0,6)}…${v.slice(-4)}` : '—';
const number = (v: bigint | number | undefined) => Number(v || 0);
function friendlyError(error:unknown):string {
  const message=error instanceof Error?error.message:'';
  if(/reject|denied|cancel/i.test(message))return 'Request cancelled. Nothing else will be sent. Try again when you’re ready.';
  if(/insufficient funds/i.test(message))return 'Your wallet needs Arbitrum Sepolia test ETH for the network fee. The play chips themselves are free.';
  if(/fee.*low|base fee|max fee/i.test(message))return 'The network fee changed. Try again for a fresh fee estimate.';
  if(/revert|Invalid|NotYourTurn/i.test(message))return 'The table changed or this move is unavailable. Check the updated table and try again.';
  return 'Could not complete this step. Check your wallet and network connection, then try again.';
}
const avatars = ['♠','♥','♦','♣','⚡','★','☠','◆'];
const avatar = (address?:string) => avatars[parseInt(address?.slice(2,4)||'0',16)%avatars.length];
const tier = (credits:number) => credits>=15?{name:'FHE LEGEND',next:15,color:'bg-pink'}:credits>=7?{name:'CIPHER ACE',next:15,color:'bg-purple text-white'}:credits>=3?{name:'CARD SHARK',next:7,color:'bg-green'}:credits>=1?{name:'BLUFFER',next:3,color:'bg-acid'}:{name:'ROOKIE',next:1,color:'bg-white'};
const ACTION_NAMES=['FOLDED','CHECKED','CALLED','RAISED','WENT ALL-IN'];
const rankName=(card:number)=>['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13];

function handInsight(cards:number[]){
  if(cards.length<2)return '';
  if(cards.length<5){const [a,b]=cards;return a%13===b%13?`Pocket ${rankName(a)}s`:Math.floor(a/13)===Math.floor(b/13)?'Suited cards':`${rankName(a%13>b%13?a:b)} high`;}
  if(new Set(cards).size!==cards.length)return 'Updating cards…';
  return HAND_NAMES[bestHand(cards)[0]]+' · your best five cards';
}

export default function PokerApp() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const contractReady = /^0x[a-fA-F0-9]{40}$/.test(POKER_ADDRESS);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [practiceOpen,setPracticeOpen]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('practice')!=='1')return;const timer=setTimeout(()=>setPracticeOpen(true),0);return()=>clearTimeout(timer);},[]);
  const [appView, setAppView] = useState<AppView>('tables');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [smallBlind, setSmallBlind] = useState(5);
  const [minBuyIn, setMinBuyIn] = useState(500);
  const { data: tableCount, refetch: refreshCount } = useReadContract({ address: POKER_ADDRESS, abi: fheBluffAbi, functionName:'tableCount', query:{ enabled:contractReady,refetchInterval:5000 } });
  const ids = useMemo(() => Array.from({ length: Math.min(number(tableCount), 48) }, (_,i)=>BigInt(number(tableCount)-1-i)), [tableCount]);
  const { data: tables, isPending:tablesLoading, refetch: refreshTables } = useReadContracts({ contracts: ids.map(id=>({ address:POKER_ADDRESS, abi:fheBluffAbi, functionName:'getTableView' as const, args:[id] })),query:{refetchInterval:5000} });
  const { data: creditData } = useReadContract({ address:POKER_ADDRESS, abi:fheBluffAbi, functionName:'credits', args: address ? [address] : undefined, query:{ enabled:contractReady && !!address,refetchInterval:5000 } });
  const { data:leaderData } = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'leaderboard',args:[100n],query:{enabled:contractReady,refetchInterval:15000}});
  const { writeContractAsync, data:txHash, isPending, error } = useWriteContract();
  const submissionLock = useRef(false);
  const [submissionLocked,setSubmissionLocked] = useState(false);
  const [submissionError,setSubmissionError] = useState('');
  const [handHistory,setHandHistory] = useState<HandResult[]>([]);
  const [historyLoading,setHistoryLoading] = useState(true);
  const [historyError,setHistoryError] = useState('');
  const { isLoading:isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash:txHash });

  useEffect(()=>{ if(isSuccess){ void refreshCount(); void refreshTables(); } },[isSuccess, refreshCount, refreshTables]);
  useEffect(()=>{
    if(!contractReady||!publicClient) return;
    let cancelled=false;
    void publicClient.getContractEvents({address:POKER_ADDRESS,abi:fheBluffAbi,eventName:'HandSettled',fromBlock:POKER_DEPLOYMENT_BLOCK,toBlock:'latest'}).then(logs=>{
      if(cancelled)return;
      setHistoryError('');
      setHandHistory(logs.map(log=>({tableId:log.args.tableId!,handId:log.args.handId!,winners:log.args.winners!,pot:log.args.pot!,transactionHash:log.transactionHash})).reverse());
    }).catch(error=>{if(!cancelled)setHistoryError(error instanceof Error?error.message:'Could not load onchain hand history');}).finally(()=>{if(!cancelled)setHistoryLoading(false);});
    return()=>{cancelled=true;};
  },[contractReady,publicClient]);
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
    if(submissionLock.current) return;
    submissionLock.current=true;setSubmissionLocked(true);
    try {
      setSubmissionError('');
      if(!publicClient||!address)throw new Error('Wallet unavailable');
      await publicClient.simulateContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args,account:address} as never);
      const fees=await publicClient.estimateFeesPerGas({type:'eip1559'});
      const buffered=fees?{maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}:{};
      const hash=await writeContractAsync({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args,...buffered} as never);
      const receipt=await publicClient.waitForTransactionReceipt({hash});
      if(receipt.status!=='success')throw new Error('Transaction reverted');
      if(functionName==='createTable'){
        for(const log of receipt.logs){
          if(log.address.toLowerCase()!==POKER_ADDRESS.toLowerCase())continue;
          try{const event=decodeEventLog({abi:fheBluffAbi,eventName:'TableCreated',data:log.data,topics:log.topics});setCreateOpen(false);setSelected(event.args.tableId);break;}catch{}
        }
      }
      await Promise.all([refreshCount(),refreshTables()]);
    } catch(e) { setSubmissionError(friendlyError(e)); }
    finally { submissionLock.current=false;setSubmissionLocked(false); }
  };
  const createTable = () => {
    if(!Number.isSafeInteger(smallBlind)||smallBlind<1||!Number.isSafeInteger(minBuyIn)||minBuyIn<smallBlind*20){setSubmissionError('Choose whole chip amounts. The buy-in must be at least 20 × the small blind.');return;}
    void transact('createTable',[maxPlayers,BigInt(smallBlind),BigInt(minBuyIn)]);
  };
  const rows = (tables || []).map((entry,i)=>({ id:ids[i], data:entry.status==='success' ? entry.result as TableView : null })).filter(x=>x.data);
  const openRows = rows.filter(({data})=>data && (number(data[5])===0 || number(data[5])===7));
  const activeRows = rows.filter(({data})=>data && number(data[5])>0 && number(data[5])<7);
  const abandonedRows = rows.filter(({data})=>data && number(data[5])===8);
  const availableSeats=openRows.filter(({data})=>data&&number(data[4])<number(data[1])&&number(data[4])>0).sort((a,b)=>number(a.data?.[1])-number(b.data?.[1])||number(b.data?.[4])-number(a.data?.[4]));
  const quickSeat=()=>{if(availableSeats[0])setSelected(availableSeats[0].id);else {setAppView('tables');setCreateOpen(true);}};
  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get('table');
    if(!value||!/^\d{1,12}$/.test(value)||!tableCount||BigInt(value)>=tableCount)return;
    const timer=setTimeout(()=>setSelected(BigInt(value)),0);return()=>clearTimeout(timer);
  },[tableCount]);
  const titles:Record<AppView,[string,string]>={tables:['ONCHAIN LOBBY','Pick your poison.'],active:['LIVE HANDS','Action is onchain.'],history:['ONCHAIN ARCHIVE','Hands leave receipts.'],credits:['PLAYER PROFILE','Your reputation.'],leaderboard:['GLOBAL CREDITS','Top the table.'],privacy:['COFHE PRIVACY','Encrypted by design.']};

  return (
    <main className="min-h-screen bg-[#ece7d7] pb-20 text-ink xl:pb-0">
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
      {(isPending || isConfirming || isSuccess || error || submissionError) && <div className={`fixed bottom-4 right-4 z-[80] max-w-sm border-3 border-ink p-4 font-bold shadow-hard ${error||submissionError?'bg-pink':isSuccess?'bg-green':'bg-acid'}`}>{submissionError?submissionError:error ? friendlyError(error) : isSuccess ? 'Transaction confirmed onchain.' : isConfirming ? 'Confirming on Arbitrum Sepolia…' : 'Check your wallet to continue.'}</div>}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-3 sm:p-6 xl:grid-cols-[230px_1fr]">
        <aside className="hidden self-start border-3 border-ink bg-ink p-4 text-white shadow-hard xl:block">
          <p className="eyebrow text-acid">COMMAND DECK</p>
          <div className="mt-7 space-y-2">{([['tables','Lobby',Users],['active','Active hands',Activity],['history','History',History],['credits','Credits',Coins],['leaderboard','Leaderboard',Trophy]] as const).map(([value,label,Icon])=><button onClick={()=>setAppView(value)} key={label} className={`flex w-full items-center gap-3 border-2 border-white/30 px-3 py-3 text-left font-bold ${appView===value?'bg-acid text-ink':''}`}><Icon className="size-5" />{label}</button>)}</div>
          <div className="mt-10 border-2 border-acid p-4"><LockKeyhole className="size-8 text-acid"/><p className="mt-4 font-black">YOUR CARDS, YOUR KEYS.</p><p className="mt-2 text-sm text-white/70">CoFHE ACPs scope decryption to the seated wallet.</p></div>
        </aside>

        <section className="min-w-0">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="eyebrow text-purple">{titles[appView][0]}</p><h1 className="font-heading text-4xl uppercase leading-none sm:text-6xl">{titles[appView][1]}</h1></div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger render={<button className="brutal-button bg-acid px-5 py-3"><Plus /> CREATE TABLE</button>} /><DialogContent className="border-3 border-ink bg-cream shadow-hard-lg sm:max-w-md"><DialogHeader><DialogTitle className="font-heading text-3xl uppercase">Create a table</DialogTitle><DialogDescription className="font-semibold text-ink/70">Pick a pace, invite rivals, and fight for onchain Credits.</DialogDescription></DialogHeader><div className="space-y-5 pt-3"><div><p className="mb-2 font-mono text-xs font-bold">QUICK PRESETS</p><div className="grid grid-cols-3 gap-2">{([{label:'DUEL',players:2,blind:5,buyIn:500},{label:'TURBO',players:4,blind:10,buyIn:1000},{label:'CHAOS',players:6,blind:25,buyIn:2500}] as const).map(preset=><button key={preset.label} onClick={()=>{setMaxPlayers(preset.players);setSmallBlind(preset.blind);setMinBuyIn(preset.buyIn);}} className="border-2 border-ink bg-white p-2 text-xs font-black hover:bg-acid"><Zap className="mx-auto mb-1 size-4"/>{preset.label}</button>)}</div></div><Field label="Seats"><select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))} className="input-brutal"><option value="2">Heads-up · 2</option><option value="4">Four-max · 4</option><option value="6">Six-max · 6</option></select></Field><Field label="Small blind"><input className="input-brutal" type="number" min="1" value={smallBlind} onChange={e=>setSmallBlind(Number(e.target.value))}/></Field><Field label="Minimum buy-in"><input className="input-brutal" type="number" min="20" value={minBuyIn} onChange={e=>setMinBuyIn(Number(e.target.value))}/></Field><button disabled={!contractReady||submissionLocked} onClick={createTable} className="brutal-button w-full bg-purple px-5 py-4 text-white disabled:cursor-not-allowed disabled:opacity-40">{submissionLocked?'TRANSACTION IN PROGRESS':!authenticated?'CONNECT TO CREATE':wrongNetwork?'SWITCH NETWORK':'CREATE ONCHAIN'}</button></div></DialogContent></Dialog>
          </div>

          <Tabs value={appView} onValueChange={value=>setAppView(value as AppView)}>
            <TabsList className="grid h-auto! w-full grid-cols-4 rounded-none border-3 border-ink bg-white p-1 shadow-hard-sm sm:inline-grid sm:w-auto">
              <TabsTrigger value="tables" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black data-active:bg-pink sm:px-5 sm:text-sm">OPEN TABLES</TabsTrigger>
              <TabsTrigger value="history" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black data-active:bg-purple data-active:text-white sm:px-5 sm:text-sm">HISTORY</TabsTrigger>
              <TabsTrigger value="leaderboard" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black data-active:bg-acid sm:px-5 sm:text-sm">LEADERBOARD</TabsTrigger>
              <TabsTrigger value="privacy" className="min-h-11 rounded-none px-1 py-3 text-[11px] font-black data-active:bg-green sm:px-5 sm:text-sm">PRIVACY</TabsTrigger>
            </TabsList>
            <TabsContent value="tables" className="mt-5">
              <PlayLaunchpad practice={()=>setPracticeOpen(true)} quickSeat={quickSeat} hasSeat={availableSeats.length>0} loading={tablesLoading} address={address} credits={creditData} totals={leaderData?.[1]}/>
              <ArenaPulse hands={handHistory} contenders={leaderData?.[0]?.length||0} />
              {!contractReady ? <Empty icon={X} title="CONTRACT NOT CONFIGURED" body="Set NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS to the deployed Arbitrum Sepolia contract. No demo tables are substituted for chain state." /> : openRows.length===0 ? <Empty icon={Spade} title="NO TABLES TAKING SEATS" body="Active and closed tables are kept out of the lobby. Connect a wallet and create a fresh table." /> : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{openRows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)} />)}</div>}
            </TabsContent>
            <TabsContent value="active" className="mt-5">{activeRows.length===0?<Empty icon={Activity} title="NO ACTIVE HANDS" body="Hands in progress will appear here with their current street and pot."/>:<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{activeRows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)}/>)}</div>}</TabsContent>
            <TabsContent value="history" className="mt-5"><HistoryPanel hands={handHistory} abandoned={abandonedRows} loading={historyLoading} error={historyError} onOpen={setSelected}/></TabsContent>
            <TabsContent value="credits" className="mt-5"><Profile address={address} credits={number(creditData)} authenticated={authenticated} login={login}/></TabsContent>
            <TabsContent value="leaderboard" className="mt-5"><Leaderboard address={address} data={leaderData as readonly [readonly `0x${string}`[],readonly bigint[]]|undefined} /></TabsContent>
            <TabsContent value="privacy" className="mt-5"><PrivacyPanel /></TabsContent>
          </Tabs>
        </section>
      </div>
      {selected!==null && <GameTable key={selected.toString()} id={selected} address={address} close={()=>{setSelected(null);window.history.replaceState(null,'','/play');}} transact={transact} busy={submissionLocked} />}
      {practiceOpen&&<PracticeTable close={()=>setPracticeOpen(false)} playRanked={()=>{setPracticeOpen(false);quickSeat();}}/>}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-3 border-ink bg-cream xl:hidden">{([['tables',Users,'Lobby'],['active',Activity,'Hands'],['history',History,'History'],['credits',Coins,'Credits'],['leaderboard',Trophy,'Ranks']] as const).map(([value,Icon,label])=><button onClick={()=>setAppView(value)} key={value} className={`grid min-h-16 place-items-center text-[10px] font-black ${appView===value?'bg-acid':''}`}><Icon className="size-5" />{label}</button>)}</nav>
    </main>
  );
}

function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="block"><span className="mb-1 block font-mono text-xs font-bold uppercase">{label}</span>{children}</label>}
function Empty({icon:Icon,title,body}:{icon:typeof Spade,title:string,body:string}){return <div className="border-3 border-ink bg-white p-8 text-center shadow-hard sm:p-14"><Icon className="mx-auto size-14"/><h2 className="mt-5 font-heading text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-lg font-semibold text-ink/65">{body}</p></div>}
function ArenaPulse({hands,contenders}:{hands:HandResult[],contenders:number}){const chips=hands.reduce((sum,hand)=>sum+number(hand.pot),0);const biggest=hands.reduce((max,hand)=>Math.max(max,number(hand.pot)),0);return <section className="mb-5 overflow-hidden border-3 border-ink bg-ink text-white shadow-hard"><div className="flex items-center justify-between border-b-2 border-white/25 bg-purple px-4 py-3"><span className="flex items-center gap-2 font-black"><Radio className="size-4 animate-pulse"/> ARENA PULSE</span><span className="font-mono text-[10px] text-acid">LIVE · ARBITRUM SEPOLIA</span></div><div className="grid grid-cols-2 sm:grid-cols-4"><ArenaStat icon={Swords} label="HANDS FOUGHT" value={hands.length}/><ArenaStat icon={Coins} label="CHIPS CONTESTED" value={chips}/><ArenaStat icon={Flame} label="BIGGEST POT" value={biggest}/><ArenaStat icon={Trophy} label="RANKED PLAYERS" value={contenders}/></div></section>}
function ArenaStat({icon:Icon,label,value}:{icon:typeof Spade,label:string,value:number}){return <div className="border-r border-t border-white/20 p-4 last:border-r-0 sm:border-t-0"><Icon className="size-5 text-acid"/><strong className="mt-2 block text-2xl">{value.toLocaleString()}</strong><span className="font-mono text-[9px] text-white/55">{label}</span></div>}

function TableCard({id,data,onOpen}:{id:bigint,data:TableView,onOpen:()=>void}){
  return <article className="group border-3 border-ink bg-white p-5 shadow-hard transition-transform hover:-translate-y-1"><div className="flex items-start justify-between"><span className="border-2 border-ink bg-purple px-2 py-1 font-mono text-xs font-bold text-white">TABLE #{id.toString()}</span><span className="flex items-center gap-1 text-xs font-bold"><span className="size-2 rounded-full bg-green"/>{PHASES[number(data[5])]||'UNKNOWN'}</span></div><h3 className="mt-7 text-2xl font-black">{number(data[4])}/{number(data[1])} PLAYERS</h3><div className="mt-5 grid grid-cols-2 gap-2 font-mono text-xs"><div className="border-2 border-ink bg-cream p-3"><span className="block opacity-55">BLINDS</span>{number(data[2])}/{number(data[2])*2}</div><div className="border-2 border-ink bg-cream p-3"><span className="block opacity-55">BUY-IN</span>{number(data[3])} CHIPS</div></div><button onClick={onOpen} className="brutal-button mt-5 w-full bg-pink py-3">OPEN TABLE</button></article>
}

function HistoryPanel({hands,abandoned,loading,error,onOpen}:{hands:HandResult[],abandoned:{id:bigint,data:TableView|null}[],loading:boolean,error:string,onOpen:(id:bigint)=>void}){
  if(loading)return <div className="border-3 border-ink bg-white p-10 text-center shadow-hard"><History className="mx-auto size-12 animate-pulse"/><h2 className="mt-4 font-heading text-3xl">READING ONCHAIN RECEIPTS</h2><p className="mt-2 font-semibold text-ink/60">Loading settlement events from Arbitrum Sepolia…</p></div>;
  if(error)return <Empty icon={X} title="HISTORY UNAVAILABLE" body="The live RPC could not return settlement events. The playable lobby is still available; try History again shortly."/>;
  if(hands.length===0&&abandoned.length===0)return <Empty icon={History} title="NO PAST HANDS YET" body="Settled hands and permanently closed tables will appear here directly from onchain records."/>;
  return <div className="space-y-7">
    <section><div className="mb-3 flex items-end justify-between gap-3"><div><p className="eyebrow text-purple">SETTLEMENT EVENTS</p><h2 className="font-heading text-3xl">COMPLETED HANDS</h2></div><span className="font-mono text-xs font-bold">{hands.length} RECORDED</span></div><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{hands.map(hand=><article key={`${hand.transactionHash}-${hand.handId}`} className="border-3 border-ink bg-white p-5 shadow-hard"><div className="flex items-center justify-between"><span className="border-2 border-ink bg-green px-2 py-1 font-mono text-xs font-bold">TABLE #{hand.tableId.toString()}</span><span className="font-mono text-xs font-bold">HAND #{hand.handId.toString()}</span></div><div className="mt-5 border-2 border-ink bg-cream p-3"><span className="font-mono text-[10px] font-bold text-ink/55">FINAL POT</span><strong className="block text-2xl">{number(hand.pot)} CHIPS</strong></div><div className="mt-4"><span className="font-mono text-[10px] font-bold text-ink/55">{hand.winners.length>1?'WINNERS · SPLIT POT':'WINNER'}</span>{hand.winners.map(winner=><p key={winner} className="mt-1 truncate font-mono text-xs font-bold">{short(winner)}</p>)}</div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>onOpen(hand.tableId)} className="brutal-button bg-pink py-3 text-xs">TABLE DETAILS</button><a href={`https://sepolia.arbiscan.io/tx/${hand.transactionHash}`} target="_blank" rel="noreferrer" className="grid place-items-center border-3 border-ink bg-acid px-2 text-center text-xs font-black shadow-hard-sm">VIEW RECEIPT</a></div></article>)}</div></section>
    {abandoned.length>0&&<section><div className="mb-3"><p className="eyebrow text-purple">CLOSED FOREVER</p><h2 className="font-heading text-3xl">ABANDONED TABLES</h2></div><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{abandoned.map(({id,data})=><article key={id.toString()} className="border-3 border-ink bg-[#d8d3c5] p-5 shadow-hard"><div className="flex items-center justify-between"><span className="border-2 border-ink bg-ink px-2 py-1 font-mono text-xs font-bold text-white">TABLE #{id.toString()}</span><span className="font-mono text-xs font-bold">ABANDONED</span></div><h3 className="mt-6 text-xl font-black">TABLE PERMANENTLY CLOSED</h3><p className="mt-2 font-semibold text-ink/65">The final seated player left. This contract state cannot accept new players.</p><p className="mt-4 font-mono text-xs font-bold">{number(data?.[6])} HANDS STARTED</p><button onClick={()=>onOpen(id)} className="brutal-button mt-5 w-full bg-white py-3">VIEW SUMMARY</button></article>)}</div></section>}
  </div>;
}

function Leaderboard({address,data}:{address?:string,data?:readonly[readonly `0x${string}`[],readonly bigint[]]}){const players=data?.[0]||[];const totals=data?.[1]||[];return <div className="border-3 border-ink bg-white shadow-hard"><div className="flex items-center justify-between border-b-3 border-ink bg-acid p-5"><div><p className="font-mono text-[10px] font-bold">THE CLIMB IS ONCHAIN</p><h2 className="font-heading text-3xl">CREDITS BOARD</h2></div><Crown/></div><div className="space-y-3 p-4 sm:p-5">{players.length===0?<p className="border-3 border-dashed border-ink p-8 text-center font-black">NO COMPLETED HANDS YET</p>:players.map((player,i)=>{const credits=number(totals[i]);const playerTier=tier(credits);return <div key={player} className={`grid grid-cols-[42px_1fr_auto] items-center gap-3 border-3 border-ink p-3 sm:grid-cols-[56px_1fr_auto] sm:p-4 ${player.toLowerCase()===address?.toLowerCase()?'bg-green':'bg-cream'}`}><span className="font-heading text-2xl">#{i+1}</span><span className="min-w-0"><span className="block truncate font-mono text-xs font-bold sm:text-sm">{avatar(player)} {short(player)}{player.toLowerCase()===address?.toLowerCase()?' · YOU':''}</span><span className={`mt-1 inline-block border border-ink px-1.5 py-0.5 font-mono text-[8px] font-black ${playerTier.color}`}>{playerTier.name}</span></span><strong>{credits} CR</strong></div>})}<p className="pt-2 text-sm font-semibold text-ink/60">Read directly from the contract. Every tied winner receives one non-transferable Credit.</p></div></div>}
function Profile({address,credits,authenticated,login}:{address?:string,credits:number,authenticated:boolean,login:()=>void}){const playerTier=tier(credits);const floor=credits>=15?15:credits>=7?7:credits>=3?3:credits>=1?1:0;const progress=credits>=15?100:Math.round(((credits-floor)/(playerTier.next-floor))*100);const achievements=[['FIRST POT','Win 1 hand',credits>=1],['TRIPLE THREAT','Win 3 hands',credits>=3],['CIPHER ACE','Win 7 hands',credits>=7],['FHE LEGEND','Win 15 hands',credits>=15]] as const;return <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><div className="border-3 border-ink bg-white p-6 shadow-hard"><div className="flex items-center gap-4"><div className="grid size-16 place-items-center border-3 border-ink bg-purple font-heading text-3xl text-acid">{avatar(address)}</div><div className="min-w-0"><p className="font-mono text-xs font-bold text-purple">CONNECTED PLAYER</p><h2 className="truncate font-heading text-2xl sm:text-3xl">{address?short(address):'NOT CONNECTED'}</h2><span className={`mt-1 inline-block border-2 border-ink px-2 py-1 font-mono text-[9px] font-black ${playerTier.color}`}>{playerTier.name}</span></div></div><div className="mt-6 grid grid-cols-2 gap-3"><StatCard label="CREDITS" value={credits}/><StatCard label="NETWORK" value="ARB SEP"/></div><div className="mt-4"><div className="mb-1 flex justify-between font-mono text-[10px] font-bold"><span>RANK PROGRESS</span><span>{credits>=15?'MAX RANK':`${credits}/${playerTier.next} CR`}</span></div><div className="h-4 border-2 border-ink bg-cream"><div className="h-full bg-pink transition-all" style={{width:`${progress}%`}}/></div></div>{!authenticated&&<button onClick={login} className="brutal-button mt-5 w-full bg-pink py-4">CONNECT PROFILE</button>}</div><div className="border-3 border-ink bg-acid p-6 shadow-hard"><Target className="size-10"/><h3 className="mt-5 font-heading text-3xl">ACHIEVEMENTS</h3><div className="mt-4 grid grid-cols-2 gap-2">{achievements.map(([name,goal,unlocked])=><div key={name} className={`border-2 border-ink p-3 ${unlocked?'bg-white':'bg-ink/15 opacity-55'}`}><span className="text-lg">{unlocked?'★':'◆'}</span><p className="mt-1 text-xs font-black">{name}</p><p className="font-mono text-[8px]">{goal}</p></div>)}</div><p className="mt-4 text-xs font-semibold">Milestones are derived from onchain Credits—not transferable tokens or pay-to-win perks.</p></div></div>}
function StatCard({label,value}:{label:string,value:string|number}){return <div className="border-3 border-ink bg-cream p-4"><span className="font-mono text-xs font-bold opacity-55">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>}
function PrivacyPanel(){return <div className="grid gap-4 lg:grid-cols-3">{[[LockKeyhole,'ENCRYPTED DEAL','Players contribute encrypted entropy. Hole-card handles receive wallet-specific ACL grants.'],[EyeOff,'NO SIDE CHANNELS','Card values never appear in events, transaction logs, or public plaintext storage.'],[ShieldCheck,'VERIFIED REVEAL','Street and showdown reveals require threshold-network signatures verified by CoFHE.']].map(([Icon,t,b])=><div key={String(t)} className="border-3 border-ink bg-white p-6 shadow-hard"><Icon className="size-10 text-purple"/><h3 className="mt-8 text-xl font-black">{String(t)}</h3><p className="mt-3 font-semibold leading-relaxed text-ink/65">{String(b)}</p></div>)}</div>}

function GameTable({id,address,close,transact,busy}:{id:bigint,address?:`0x${string}`,close:()=>void,busy:boolean,transact:(name:'joinTable'|'leaveTable'|'startHand'|'act'|'forceTimeoutFold'|'abortStalledHand',args:readonly unknown[])=>void}){
  const [privateHand,setPrivateHand]=useState<{key:string;cards:number[]}|null>(null);
  const [inviteStatus,setInviteStatus]=useState('');
  const [privacyStatus,setPrivacyStatus]=useState('');
  const [actionFeed,setActionFeed]=useState<ActionEntry[]>([]);
  const [lastResult,setLastResult]=useState<HandResult|null>(null);
  const [soundOn,setSoundOn]=useState(false);
  const [now,setNow]=useState(0);
  const privateLock=useRef(false);const [privateLocked,setPrivateLocked]=useState(false);
  const publicClient=usePublicClient(); const {data:walletClient}=useWalletClient(); const {writeContractAsync:writePrivate,data:privateTxHash,isPending:privatePending,error:privateError}=useWriteContract();
  const {isLoading:privateConfirming,isSuccess:privateSuccess}=useWaitForTransactionReceipt({hash:privateTxHash});
  const {data:view,refetch:refetchView} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getTableView',args:[id],query:{refetchInterval:5000}});
  const {data:seatData,refetch:refetchSeats} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getSeats',args:[id],query:{refetchInterval:5000}});
  const {data:community,refetch:refetchCommunity} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getCommunityCards',args:[id],query:{refetchInterval:5000}});
  const {data:shuffleRemaining,refetch:refetchShuffle} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getShuffleProgress',args:[id],query:{refetchInterval:3000}});
  const {data:entropySubmitted,refetch:refetchEntropy} = useReadContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'hasSubmittedEntropy',args:address?[id,address]:undefined,query:{enabled:!!address,refetchInterval:3000}});
  useEffect(()=>{const tick=()=>setNow(Math.floor(Date.now()/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
  const table=view as TableView|undefined; const seats=seatData as readonly [`0x${string}`[],bigint[],bigint[],number[]]|undefined;
  const {data:seatCreditData}=useReadContracts({contracts:(seats?.[0]||[]).map(player=>({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'credits' as const,args:[player]})),query:{enabled:!!seats?.[0].length,refetchInterval:15000}});
  useEffect(()=>{
    if(!publicClient)return;
    let cancelled=false;
    const loadArena=async()=>{try{const [actions,results]=await Promise.all([publicClient.getContractEvents({address:POKER_ADDRESS,abi:fheBluffAbi,eventName:'ActionTaken',args:{tableId:id},fromBlock:POKER_DEPLOYMENT_BLOCK,toBlock:'latest'}),publicClient.getContractEvents({address:POKER_ADDRESS,abi:fheBluffAbi,eventName:'HandSettled',args:{tableId:id},fromBlock:POKER_DEPLOYMENT_BLOCK,toBlock:'latest'})]);if(cancelled)return;setActionFeed(actions.slice(-8).reverse().map(log=>({player:log.args.player!,action:number(log.args.action),amount:log.args.amount!,transactionHash:log.transactionHash})));const latest=results.at(-1);setLastResult(latest?{tableId:latest.args.tableId!,handId:latest.args.handId!,winners:latest.args.winners!,pot:latest.args.pot!,transactionHash:latest.transactionHash}:null);}catch{/* Live reads retry quietly; transaction errors remain visible. */}};
    void loadArena();const timer=setInterval(()=>void loadArena(),5000);return()=>{cancelled=true;clearInterval(timer);};
  },[publicClient,id]);
  const cardContext=`${id}:${table?.[6]}:${address?.toLowerCase()}`;
  const privateCards=privateHand?.key===cardContext?privateHand.cards:[];
  const me=seats?.[0].findIndex(x=>x.toLowerCase()===address?.toLowerCase())??-1;
  const stage=PHASES[number(table?.[5])]||'LOADING';
  const timedOut=number(table?.[10])>0&&now>number(table?.[10]);
  const shuffleBatches=Math.ceil(number(shuffleRemaining)/4);
  const dealCardCount=(seats?.[3].filter(state=>state!==3).length??number(table?.[4]))*2+5;
  const phase=number(table?.[5]);
  const isMyTurn=phase>=2&&phase<=5&&me>=0&&seats?.[3][me]===0&&number(table?.[9])===me;
  const joinable=phase===0||phase===7;
  const tableFull=number(table?.[4])>=number(table?.[1]);
  const tableStatus=!table?'SYNCING':phase===8?'TABLE CLOSED · NO ACTIONS':phase===7?'HAND COMPLETE · READY FOR NEXT':phase===0?'SEATING · WAITING FOR PLAYERS':isMyTurn?'YOUR TURN':`SEAT ${number(table[9])+1} TO ACT`;
  const revealed=community?.length??0;
  const expectedBoard=phase===3?3:phase===4?4:phase===5?5:0;
  const needsBoardReveal=expectedBoard>revealed;
  const allInRunout=seats ? seats[3].every(state=>state!==0) : false;
  const revealLabel=allInRunout?'RUN OUT BOARD':phase===3?'REVEAL FLOP':phase===4?'REVEAL TURN':'REVEAL RIVER';
  const privateBusy=privateLocked||privatePending||privateConfirming;
  const seatCredits=(seatCreditData||[]).map(entry=>entry.status==='success'?number(entry.result as bigint):0);
  const secondsLeft=Math.max(0,number(table?.[10])-now);
  const clockPercent=Math.min(100,(secondsLeft/120)*100);
  const potRatio=number(table?.[2])?number(table?.[7])/(number(table?.[2])*2):0;
  const heat=potRatio>=20?'INFERNO':potRatio>=8?'HEATING UP':'CALM';
  const insight=privateCards.length?handInsight([...privateCards,...(community||[]).map(Number)]):'';
  const inviteFriend=async()=>{const url=new URL('/play',window.location.origin);url.searchParams.set('table',id.toString());try{await navigator.clipboard.writeText(url.toString());setInviteStatus('Invite copied — send it to a friend');}catch{setInviteStatus(url.toString());}};
  const playTone=(frequency=440)=>{if(!soundOn||typeof window==='undefined')return;const AudioContextClass=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AudioContextClass)return;const audio=new AudioContextClass();const oscillator=audio.createOscillator();const gain=audio.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.12);oscillator.onended=()=>void audio.close();};
  const makeMove=(action:number,amount=0n)=>{if(busy||privateBusy)return;playTone(action===ACTIONS.ALL_IN?720:action===ACTIONS.RAISE?620:420);transact('act',[id,action,amount]);};
  const connectCofhe=async()=>{if(!publicClient||!walletClient)throw new Error('Connect a wallet first');await cofheClient.connect(publicClient as never,walletClient as never);};
  const runPrivateTask=async(task:()=>Promise<void>)=>{if(busy||privateLock.current)return;privateLock.current=true;setPrivateLocked(true);try{await task();}finally{privateLock.current=false;setPrivateLocked(false);}};
  const freshPrivateWrite=async(request:Parameters<typeof writePrivate>[0])=>{if(!publicClient||!address)throw new Error('Network client unavailable');await publicClient.simulateContract({...request,account:address} as never);const fees=await publicClient.estimateFeesPerGas({type:'eip1559'});setPrivacyStatus('Check your wallet to continue.');const hash=await writePrivate({...request,maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas} as never);setPrivacyStatus('Confirming on Arbitrum Sepolia…');const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Transaction reverted');await Promise.all([refetchView(),refetchSeats(),refetchCommunity(),refetchShuffle(),refetchEntropy()]);};
  const advanceEncryptedShuffle=()=>void runPrivateTask(async()=>{try{setPrivacyStatus('Preparing the next private deal batch…');await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'advanceShuffle',args:[id,4]});setPrivacyStatus('Deal batch confirmed.');}catch(e){setPrivacyStatus(friendlyError(e));}});
  const submitEncryptedEntropy=()=>void runPrivateTask(async()=>{try{setPrivacyStatus('Generating private entropy and ZK proof…');await connectCofhe();const words=new BigUint64Array(2);crypto.getRandomValues(words);const entropy=(words[0]<<64n)|words[1];const [handle,proof]=await cofheClient.encryptInputs([Encryptable.uint128(entropy)]).setConsumingContract(POKER_ADDRESS).execute();await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'submitEntropy',args:[id,handle,proof]});setPrivacyStatus('Private entropy confirmed.');}catch(e){setPrivacyStatus(friendlyError(e));}});
  const decryptMine=()=>void runPrivateTask(async()=>{try{setPrivacyStatus('Authorizing your card-only ACP…');await connectCofhe();await cofheClient.acp.getOrCreateSelfACP();const handles=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getMyHoleCards',args:[id],account:address});const cards=await Promise.all(handles.map(h=>cofheClient.decryptForView(h,FheTypes.Uint8).execute()));setPrivateHand({key:cardContext,cards:cards.map(Number)});setPrivacyStatus('Cards decrypted locally. They were not published onchain.');}catch(e){setPrivacyStatus(friendlyError(e));}});
  const publishReveal=(showdown=false)=>void runPrivateTask(async()=>{try{setPrivacyStatus('Requesting threshold-signed reveal…');await connectCofhe();const functionName=showdown?'getShowdownHandles':'getCommunityHandles';const handles=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args:[id]}) as readonly `0x${string}`[];const revealed=await Promise.all(handles.map(h=>cofheClient.decryptForTx(h).withoutACP().execute()));await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:showdown?'settleShowdown':'publishCommunity',args:[id,revealed.map(x=>Number(x.decryptedValue)),revealed.map(x=>x.signature)]} as never);setPrivacyStatus(showdown?'Hand settled.':'Board revealed.');}catch(e){setPrivacyStatus(friendlyError(e));}});
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#191917] text-white"><header className="sticky top-0 z-20 flex items-center justify-between border-b-3 border-white/25 bg-ink px-3 py-3 sm:px-6"><button onClick={close} className="flex items-center gap-2 font-black"><ArrowLeft/> LOBBY</button><div className="text-center"><p className="font-mono text-[10px] text-acid">TABLE #{id.toString()}</p><p className="font-black">{stage}</p></div><div className="border-2 border-acid px-3 py-2 font-mono text-xs">POT {number(table?.[7])}</div></header><div className="mx-auto grid min-h-[calc(100vh-68px)] max-w-7xl grid-rows-[auto_1fr_auto] gap-4 p-3 pb-28 sm:p-6">
    <TableGuide phase={phase} seated={me>=0} host={address?.toLowerCase()===table?.[0].toLowerCase()} players={number(table?.[4])} submitted={!!entropySubmitted} batches={shuffleBatches} myTurn={isMyTurn} due={Math.min(number(seats?.[1][me]),Math.max(0,number(table?.[8])-number(seats?.[2][me])))} boardPending={needsBoardReveal} folded={seats?.[3][me]===1} allIn={seats?.[3][me]===2} busy={busy||privateBusy}/>
    <div><div className="mb-2 grid grid-cols-5 border-2 border-white/25 text-center font-mono text-[8px] font-black sm:text-[10px]">{['PREFLOP','FLOP','TURN','RIVER','SHOWDOWN'].map((label,index)=><span key={label} className={`border-r border-white/20 px-1 py-2 last:border-r-0 ${phase===index+2?'bg-acid text-ink':phase>index+2?'bg-green text-ink':'text-white/40'}`}>{phase>index+2?'✓ ':''}{label}</span>)}</div><div className="grid grid-cols-4 gap-2 text-center"><Stat label="CURRENT BET" value={number(table?.[8])}/><Stat label="YOUR STACK" value={me>=0?number(seats?.[1][me]):0}/><Stat label="HAND" value={`#${number(table?.[6])}`}/><Stat label="CLOCK" value={phase>=2&&phase<=6&&number(table?.[10])>0?`${secondsLeft}s`:'—'}/></div>{phase>=2&&phase<=6&&number(table?.[10])>0&&<div className="h-1 bg-white/15"><div className={`h-full transition-all ${secondsLeft<30?'bg-pink':'bg-acid'}`} style={{width:`${clockPercent}%`}}/></div>}</div>
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative grid min-h-[480px] place-items-center overflow-hidden border-3 border-acid bg-[#0f714c] p-3 shadow-[8px_8px_0_#d8ff3e] sm:rounded-[45%]">
        <div className="absolute inset-4 border-2 border-dashed border-white/25 sm:rounded-[45%]" />
        <div className="relative z-10 text-center"><p className="font-mono text-xs font-bold text-acid">{stage} · {tableStatus}</p><div className="mt-5 flex justify-center gap-2">{Array.from({length:5},(_,i)=><PlayingCard key={i} value={community?.[i]} hidden={community?.[i]===undefined}/>)}</div><div className={`mt-6 inline-flex items-center gap-2 border-3 border-ink px-5 py-3 font-heading text-2xl text-ink ${heat==='INFERNO'?'winner-burst bg-pink':'bg-acid'}`}><Flame className="size-5"/>{number(table?.[7])} CHIPS</div></div>
        <div className="absolute inset-x-3 top-3 flex justify-center gap-2 sm:inset-x-24 sm:justify-between">{seats?.[0].slice(0,3).map((p,i)=><Seat key={p} player={p} stack={number(seats[1][i])} bet={number(seats[2][i])} state={seats[3][i]} active={phase>=2&&phase<=5&&!needsBoardReveal&&number(table?.[9])===i} credits={seatCredits[i]||0}/>)}</div>
        <div className="absolute inset-x-3 bottom-3 flex justify-center gap-2 sm:inset-x-24 sm:justify-between">{seats?.[0].slice(3,6).map((p,j)=>{const i=j+3;return <Seat key={p} player={p} stack={number(seats[1][i])} bet={number(seats[2][i])} state={seats[3][i]} active={phase>=2&&phase<=5&&!needsBoardReveal&&number(table?.[9])===i} credits={seatCredits[i]||0}/>})}</div>
      </div>
      <aside className="border-3 border-white/25 bg-ink p-3 shadow-[5px_5px_0_#6c45ff]">
        <div className="flex items-center justify-between border-b-2 border-white/20 pb-3"><div><p className="font-mono text-[9px] text-white/45">POT TEMPERATURE</p><p className={`font-heading text-2xl ${heat==='INFERNO'?'text-pink':heat==='HEATING UP'?'text-acid':'text-green'}`}>{heat}</p></div><button onClick={()=>setSoundOn(value=>!value)} aria-label={soundOn?'Mute table sounds':'Enable table sounds'} className="grid size-10 place-items-center border-2 border-white/30 hover:bg-white/10">{soundOn?<Volume2/>:<VolumeX/>}</button></div>
        {phase===7&&lastResult&&lastResult.handId===table?.[6]&&<div className="winner-burst mt-3 border-2 border-acid bg-acid p-3 text-ink"><Sparkles className="size-5"/><p className="mt-2 font-heading text-2xl">POT CLAIMED!</p><p className="font-mono text-[9px] font-bold">{lastResult.winners.map(short).join(' + ')}</p><strong>{number(lastResult.pot)} CHIPS</strong></div>}
        <div className="mt-4"><div className="flex items-center justify-between"><p className="font-mono text-[10px] font-bold text-acid">LIVE ACTION</p><Activity className="size-4 text-pink"/></div><div className="mt-2 space-y-2">{actionFeed.length===0?<p className="border border-dashed border-white/25 p-3 text-center text-xs text-white/45">The rail wakes up after the first move.</p>:actionFeed.map(entry=><div key={`${entry.transactionHash}-${entry.player}`} className="border-l-2 border-acid bg-white/5 p-2"><p className="font-mono text-[9px] text-white/55">{avatar(entry.player)} {short(entry.player)}</p><p className="text-xs font-black">{ACTION_NAMES[entry.action]||'ACTED'}{entry.amount>0n?` · ${number(entry.amount)}`:''}</p></div>)}</div></div>
      </aside>
    </div>
    <div className="z-20 border-3 sm:sticky border-ink bg-cream p-3 text-ink shadow-hard sm:bottom-3">
      {phase===8?<div className="mb-3 border-3 border-ink bg-white p-4"><p className="font-heading text-2xl">ARCHIVED TABLE</p><p className="mt-1 text-sm font-semibold text-ink/65">The final player left, permanently closing this table. No wallet transaction is required here.</p></div>:<div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2"><PlayingCard value={privateCards[0]} hidden={privateCards.length===0}/><PlayingCard value={privateCards[1]} hidden={privateCards.length===0}/></div>
        <div className="max-w-[60%] text-right"><p className="font-mono text-[10px] font-bold">PRIVATE HAND</p><p className="text-xs font-semibold text-purple"><LockKeyhole className="inline size-3"/> {privateCards.length?'DECRYPTED LOCALLY':'ACP LOCKED'}</p>{insight&&<p className="mt-1 inline-flex items-center gap-1 border-2 border-ink bg-acid px-2 py-1 text-[9px] font-black"><Target className="size-3"/>{insight}</p>}<p className="mt-1 truncate text-[10px] font-bold text-ink/55">{privateError?'Transaction failed':privateConfirming?'Confirming onchain…':privatePending?'Check your wallet…':privacyStatus||(privateSuccess?'Transaction confirmed.':'')}</p></div>
      </div>}
      {(phase===0||phase===7)&&<div className="mb-3"><button onClick={inviteFriend} className="min-h-11 border-2 border-ink bg-white px-3 text-sm font-black">Copy friend invite</button>{inviteStatus&&<output className="mt-1 block break-all text-xs">{inviteStatus}</output>}</div>}
      <fieldset disabled={busy||privateBusy} className="min-w-0 disabled:opacity-60">
      {!table?<div className="border-3 border-ink bg-white p-4 text-center font-black">SYNCING TABLE STATE…</div>
      : phase===8?<button onClick={close} className="brutal-button w-full bg-acid py-4">BACK TO LOBBY · CREATE A NEW TABLE</button>
      : me<0 ? !joinable?<div className="border-3 border-ink bg-white p-4 text-center"><p className="font-black">SPECTATING · HAND IN PROGRESS</p><p className="mt-1 text-xs font-semibold text-ink/60">Seats reopen after the hand is settled.</p></div>
      : tableFull?<div className="border-3 border-ink bg-white p-4 text-center"><p className="font-black">TABLE FULL</p><p className="mt-1 text-xs font-semibold text-ink/60">Watch this table or choose another from the lobby.</p></div>
      : <button onClick={()=>transact('joinTable',[id,BigInt(table[3])])} className="brutal-button w-full bg-acid py-4">TAKE A SEAT · {number(table[3])} FREE CHIPS</button>
      : phase===0||phase===7 ? <div className="grid grid-cols-2 gap-2"><button onClick={()=>transact('leaveTable',[id])} className="brutal-button bg-white py-4">LEAVE TABLE</button>{address?.toLowerCase()===table?.[0]?.toLowerCase()&&(seats?.[1].filter(stack=>stack>0n).length||0)>=2?<button onClick={()=>transact('startHand',[id])} className="brutal-button bg-pink py-4">START HAND</button>:<div className="grid place-items-center border-3 border-ink bg-white p-2 text-center text-xs font-black">WAITING FOR HOST</div>}</div>
      : phase===1 ? timedOut ? <button onClick={()=>transact('abortStalledHand',[id])} className="brutal-button w-full bg-pink py-4">RESET STALLED DEAL</button>
      : number(shuffleRemaining)>0 ? <div><div className="mb-2 flex items-center justify-between font-mono text-xs font-bold"><span>PRIVATE DEAL</span><span>{shuffleBatches} {shuffleBatches===1?'BATCH':'BATCHES'} LEFT</span></div><div className="mb-3 h-2 border-2 border-ink bg-white"><div className="h-full bg-purple" style={{width:`${Math.max(8,100-(number(shuffleRemaining)/dealCardCount)*100)}%`}}/></div><button disabled={privateBusy} onClick={advanceEncryptedShuffle} className="brutal-button w-full bg-acid py-4 disabled:cursor-wait disabled:opacity-50"><ShieldCheck/> {privateBusy?'TRANSACTION IN PROGRESS':'DEAL NEXT BATCH'}</button></div>
      : entropySubmitted ? <div className="border-3 border-ink bg-white p-4 text-center font-black">READY · WAITING FOR OTHER PLAYERS</div>
      : <button disabled={privateBusy} onClick={submitEncryptedEntropy} className="brutal-button w-full bg-purple py-4 text-white disabled:cursor-wait disabled:opacity-50"><LockKeyhole/> {privateBusy?'TRANSACTION IN PROGRESS':'READY MY PRIVATE CARDS'}</button>
      : phase===6 ? <button disabled={privateBusy} onClick={()=>publishReveal(true)} className="brutal-button w-full bg-pink py-4 disabled:cursor-wait disabled:opacity-50"><ShieldCheck/> {privateBusy?'FINDING WINNER…':'SHOW WINNER · AWARD CREDITS'}</button>
      : needsBoardReveal ? <button disabled={privateBusy} onClick={()=>publishReveal(false)} className="brutal-button w-full bg-green py-4 disabled:cursor-wait disabled:opacity-50"><ShieldCheck/> {privateBusy?'REVEALING…':revealLabel}</button>
      : <><div className="mb-2 grid grid-cols-2 gap-2"><button disabled={privateBusy} onClick={privateCards.length?undefined:decryptMine} className="min-h-12 border-2 border-ink bg-white px-3 py-2 text-xs font-black disabled:cursor-wait disabled:opacity-50"><Eye/> {privateBusy?'WORKING…':privateCards.length?'CARDS VISIBLE':'SHOW MY CARDS · NO GAS'}</button>{timedOut?<button onClick={()=>transact('forceTimeoutFold',[id])} className="min-h-12 border-2 border-ink bg-pink px-3 py-2 text-xs font-black">SKIP TIMED-OUT PLAYER</button>:<div className="grid place-items-center border-2 border-ink bg-white px-2 text-center font-mono text-[10px] font-bold">{isMyTurn?<span className="flex items-center gap-1 text-purple"><Timer className="size-3"/> YOUR MOVE · {secondsLeft}s</span>:'WAITING FOR PLAYER'}</div>}</div>{isMyTurn?<BettingControls key={`${table?.[6]}:${phase}:${number(table?.[8])}`} stack={number(seats?.[1][me])} bet={number(seats?.[2][me])} currentBet={number(table?.[8])} pot={number(table?.[7])} bigBlind={number(table?.[2])*2} onMove={makeMove}/>:<div className="border-3 border-ink bg-white p-3 text-center text-sm font-black">Your buttons appear when it’s your turn.</div>}</>}
      </fieldset>
    </div>
  </div></div>
}
function Stat({label,value}:{label:string,value:string|number}){return <div className="border-2 border-white/30 bg-black/30 p-2"><span className="block font-mono text-[9px] text-white/55">{label}</span><strong>{value}</strong></div>}
function PlayingCard({value,hidden}:{value?:number,hidden?:boolean}){const rank=value!==undefined?['2','3','4','5','6','7','8','9','10','J','Q','K','A'][value%13]:'?';const suit=value!==undefined?['♣','♦','♥','♠'][Math.floor(value/13)]:'◆';return <div className={`grid h-20 w-14 place-items-center border-3 border-ink text-xl font-black shadow-hard-sm sm:h-28 sm:w-20 ${hidden?'bg-purple text-acid':'card-pop bg-white text-ink'}`}>{hidden?<EyeOff/>:<span>{rank}{suit}</span>}</div>}
function Seat({player,stack,bet,state,active,credits}:{player:string,stack:number,bet:number,state:number,active:boolean,credits:number}){const playerTier=tier(credits);return <div className={`min-w-23 border-2 border-ink p-1.5 text-center text-ink sm:min-w-27 sm:p-2 ${active?'turn-pulse bg-acid':'bg-white'}`}><div className="mx-auto grid size-7 place-items-center bg-purple text-sm font-black text-acid">{avatar(player)}</div><p className="mt-1 font-mono text-[8px]">{short(player)}</p><p className="text-[11px] font-black">{stack} · BET {bet}</p><span className="font-mono text-[7px] font-black text-purple">{playerTier.name} · {credits} CR</span>{state>0&&<span className="block text-[8px] font-bold text-pink">{['','FOLDED','ALL-IN','SITTING OUT'][state]}</span>}</div>}
