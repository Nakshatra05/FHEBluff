'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWalletClient, useWriteContract } from 'wagmi';
import { Encryptable } from '@cofhe/sdk';
import { decodeEventLog, multicall3Abi } from 'viem';
import { PracticeTable } from '@/components/poker/practice-table';
import { WalletMenu } from '@/components/poker/wallet-menu';
import { PlayLaunchpad } from '@/components/poker/play-launchpad';
import { TableGuide } from '@/components/poker/table-guide';
import { BettingControls } from '@/components/poker/betting-controls';
import { TransactionNotice } from '@/components/poker/transaction-notice';
import { PokerArena, PlayingCard } from '@/components/poker/poker-arena';
import { HandHistory } from '@/components/poker/hand-history';
import { usePrivateCards } from '@/components/poker/use-private-cards';
import { buildDealCalls, DEAL_ROUTER } from '@/lib/deal-batch';
import { isOpenTable, recoveryAction } from '@/lib/table-lifecycle';
import { transactionError, type TransactionFeedback } from '@/lib/transaction-feedback';
import { bestHand, HAND_NAMES } from '@/lib/practice-poker';
import { Activity, ArrowLeft, Coins, Crown, Eye, EyeOff, Flame, History, LockKeyhole, Plus, Radio, ShieldCheck, Sparkles, Spade, Swords, Target, Timer, Trophy, Users, X, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fheBluffAbi, PHASES } from '@/lib/fhebluff-abi';
import { ARBITRUM_SEPOLIA_CHAIN_ID, POKER_ADDRESS, POKER_DEPLOYMENT_BLOCK } from '@/lib/network';
import { cofheClient } from '@/lib/cofhe-client';

type TableView = readonly [`0x${string}`, number, bigint, bigint, number, number, bigint, bigint, bigint, number, bigint];
type AppView = 'tables'|'active'|'history'|'credits'|'leaderboard'|'privacy';
type HandResult = { tableId:bigint; handId:bigint; winners:readonly `0x${string}`[]; pot:bigint; transactionHash:`0x${string}`; voided?:boolean;blockNumber?:bigint };
type ActionEntry = { player:`0x${string}`; action:number; amount:bigint; transactionHash:`0x${string}` };
const short = (v?: string) => v ? `${v.slice(0,6)}…${v.slice(-4)}` : '—';
const number = (v: bigint | number | undefined) => Number(v || 0);
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
  useEffect(()=>{if(selected===null)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;};},[selected]);
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
  const { writeContractAsync } = useWriteContract();
  const submissionLock = useRef(false);
  const [submissionLocked,setSubmissionLocked] = useState(false);
  const [notice,setNotice] = useState<TransactionFeedback|null>(null);
  const dismissNotice=useCallback(()=>setNotice(null),[]);
  const [handHistory,setHandHistory] = useState<HandResult[]>([]);
  const [historyLoading,setHistoryLoading] = useState(true);
  const [historyError,setHistoryError] = useState('');
  useEffect(()=>{
    if(!contractReady||!publicClient) return;
    let cancelled=false;
    let fetching=false;
    const load=async()=>{if(fetching)return;fetching=true;try{
      const [settled,voided]=await Promise.all([
        publicClient.getContractEvents({address:POKER_ADDRESS,abi:fheBluffAbi,eventName:'HandSettled',fromBlock:POKER_DEPLOYMENT_BLOCK,toBlock:'latest'}),
        publicClient.getContractEvents({address:POKER_ADDRESS,abi:fheBluffAbi,eventName:'HandAborted',fromBlock:POKER_DEPLOYMENT_BLOCK,toBlock:'latest'}),
      ]);
      if(cancelled)return;setHistoryError('');
      setHandHistory([...settled.map(log=>({tableId:log.args.tableId!,handId:log.args.handId!,winners:log.args.winners!,pot:log.args.pot!,transactionHash:log.transactionHash,blockNumber:log.blockNumber})),...voided.map(log=>({tableId:log.args.tableId!,handId:log.args.handId!,winners:[] as `0x${string}`[],pot:0n,transactionHash:log.transactionHash,voided:true,blockNumber:log.blockNumber}))].sort((a,b)=>a.blockNumber>b.blockNumber?-1:1));
    }catch{if(!cancelled)setHistoryError('History unavailable');}finally{fetching=false;if(!cancelled)setHistoryLoading(false);}};
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{cancelled=true;clearInterval(timer);};
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
    let submittedHash:`0x${string}`|undefined;
    try {
      setNotice({kind:'pending',title:'Checking your move',message:'Making sure this action is available before opening your wallet.'});
      if(!publicClient||!address)throw new Error('Wallet unavailable');
      await publicClient.simulateContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args,account:address} as never);
      const fees=await publicClient.estimateFeesPerGas({type:'eip1559'});
      const buffered=fees?{maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}:{};
      setNotice({kind:'pending',title:'Your wallet is ready',message:'Open your wallet to approve or cancel this request.'});
      const hash=await writeContractAsync({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args,...buffered} as never);
      submittedHash=hash;
      setNotice({kind:'pending',title:'Move sent',message:'Waiting for confirmation on Arbitrum Sepolia.',hash});
      const receipt=await publicClient.waitForTransactionReceipt({hash});
      if(receipt.status!=='success')throw new Error('Transaction reverted');
      if(functionName==='createTable'){
        for(const log of receipt.logs){
          if(log.address.toLowerCase()!==POKER_ADDRESS.toLowerCase())continue;
          try{const event=decodeEventLog({abi:fheBluffAbi,eventName:'TableCreated',data:log.data,topics:log.topics});setCreateOpen(false);setSelected(event.args.tableId);break;}catch{}
        }
      }
      setNotice({kind:'success',title:'Move confirmed',message:'Your action is confirmed onchain.',hash});
      await Promise.allSettled([refreshCount(),refreshTables()]);
    } catch(e) { setNotice(transactionError(e,submittedHash)); }
    finally { submissionLock.current=false;setSubmissionLocked(false); }
  };
  const createTable = () => {
    if(!Number.isSafeInteger(smallBlind)||smallBlind<1||!Number.isSafeInteger(minBuyIn)||minBuyIn<smallBlind*20){setNotice({kind:'error',title:'Check your chip amounts',message:'Use whole chips, a small blind of at least 1, and a buy-in of at least 20 × the small blind.'});return;}
    void transact('createTable',[maxPlayers,BigInt(smallBlind),BigInt(minBuyIn)]);
  };
  const rows = (tables || []).map((entry,i)=>({ id:ids[i], data:entry.status==='success' ? entry.result as TableView : null })).filter(x=>x.data);
  const openRows = rows.filter(({data})=>data && isOpenTable(number(data[5]),number(data[4]),number(data[1])));
  const activeRows = rows.filter(({data})=>data && ((number(data[5])>0 && number(data[5])<7)||(number(data[5])===0&&number(data[4])>=number(data[1]))));
  const availableSeats=openRows.filter(({data})=>data&&number(data[4])<number(data[1])&&number(data[4])>0).sort((a,b)=>number(a.data?.[1])-number(b.data?.[1])||number(b.data?.[4])-number(a.data?.[4]));
  const quickSeat=()=>{if(availableSeats[0])setSelected(availableSeats[0].id);else {setAppView('tables');setCreateOpen(true);}};
  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get('table');
    if(!value||!/^\d{1,12}$/.test(value)||!tableCount||BigInt(value)>=tableCount)return;
    const timer=setTimeout(()=>setSelected(BigInt(value)),0);return()=>clearTimeout(timer);
  },[tableCount]);
  const titles:Record<AppView,[string,string]>={tables:['ONCHAIN LOBBY','Find your next hand.'],active:['LIVE HANDS','Action is onchain.'],history:['ONCHAIN ARCHIVE','Hands leave receipts.'],credits:['PLAYER PROFILE','Your reputation.'],leaderboard:['GLOBAL CREDITS','Top the table.'],privacy:['COFHE PRIVACY','Encrypted by design.']};

  return (
    <main className="min-h-screen bg-[#ece7d7] pb-20 text-ink sm:pb-0">
      <header className="sticky top-0 z-40 border-b-3 border-ink bg-cream">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3"><button onClick={()=>window.location.assign('/')} aria-label="Back to landing page" className="grid size-10 place-items-center border-3 border-ink bg-white shadow-hard-sm"><ArrowLeft className="size-5" /></button><div className="flex items-center gap-2 font-black"><Spade className="size-6 fill-current" /> <span className="hidden sm:inline">FHEBLUFF</span></div></div>
          <div className="hidden items-center gap-2 border-3 border-ink bg-white px-3 py-2 font-mono text-sm font-bold md:flex"><span className="size-2.5 rounded-full bg-green" /> ARBITRUM SEPOLIA · 421614</div>
          <div className="flex items-center gap-2">
            {authenticated && <button onClick={()=>setAppView('credits')} className="hidden border-3 border-ink bg-acid px-3 py-2 text-base font-black sm:block">{number(creditData)} CR</button>}
            {!ready ? <div className="h-11 w-32 animate-pulse border-3 border-ink bg-white" /> : authenticated ? <WalletMenu address={address} profile={()=>setAppView('credits')} logout={()=>void logout()}/> : <button onClick={login} className="brutal-button bg-pink px-4 py-2 text-base">CONNECT</button>}
          </div>
        </div>
      </header>

      {wrongNetwork && <button onClick={()=>switchChain({chainId:ARBITRUM_SEPOLIA_CHAIN_ID})} className="flex w-full items-center justify-center gap-2 border-b-3 border-ink bg-pink px-4 py-3 font-black">WRONG NETWORK — SWITCH TO ARBITRUM SEPOLIA <Radio className="size-4" /></button>}
      {notice&&!practiceOpen&&!createOpen&&<TransactionNotice notice={notice} onDismiss={dismissNotice}/>}

      <div className="mx-auto max-w-6xl p-3 sm:p-6">
        <section className="min-w-0">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="eyebrow text-purple">{titles[appView][0]}</p><h1 className="font-heading text-3xl uppercase leading-none sm:text-4xl">{titles[appView][1]}</h1></div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger render={<button className="brutal-button bg-acid px-5 py-3"><Plus /> CREATE TABLE</button>} /><DialogContent className="border-3 border-ink bg-cream shadow-hard-lg max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle className="font-heading text-3xl uppercase">Create a table</DialogTitle><DialogDescription className="font-semibold text-ink/70">Pick a pace, invite rivals, and fight for onchain Credits.</DialogDescription></DialogHeader><div className="space-y-5 pt-3">{notice&&<TransactionNotice notice={notice} onDismiss={dismissNotice} inline/>}<div><p className="mb-2 font-mono text-sm font-bold">QUICK PRESETS</p><div className="grid grid-cols-3 gap-2">{([{label:'DUEL',players:2,blind:5,buyIn:500},{label:'TURBO',players:4,blind:10,buyIn:1000},{label:'CHAOS',players:6,blind:25,buyIn:2500}] as const).map(preset=><button key={preset.label} onClick={()=>{setMaxPlayers(preset.players);setSmallBlind(preset.blind);setMinBuyIn(preset.buyIn);}} className="border-2 border-ink bg-white p-2 text-sm font-black hover:bg-acid"><Zap className="mx-auto mb-1 size-4"/>{preset.label}</button>)}</div></div><Field label="Seats"><select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))} className="input-brutal"><option value="2">Heads-up · 2</option><option value="4">Four-max · 4</option><option value="6">Six-max · 6</option></select></Field><Field label="Small blind"><input className="input-brutal" type="number" min="1" value={smallBlind} onChange={e=>setSmallBlind(Number(e.target.value))}/></Field><Field label="Minimum buy-in"><input className="input-brutal" type="number" min="20" value={minBuyIn} onChange={e=>setMinBuyIn(Number(e.target.value))}/></Field><button disabled={!contractReady||submissionLocked} onClick={createTable} className="brutal-button w-full bg-purple px-5 py-4 text-white disabled:cursor-not-allowed disabled:opacity-40">{submissionLocked?'TRANSACTION IN PROGRESS':!authenticated?'CONNECT TO CREATE':wrongNetwork?'SWITCH NETWORK':'CREATE ONCHAIN'}</button></div></DialogContent></Dialog>
          </div>

          <Tabs value={appView} onValueChange={value=>setAppView(value as AppView)}>
            <TabsList className="hidden h-auto! w-full grid-cols-6 rounded-none border-2 border-ink bg-white p-1 sm:grid">{([['tables','Lobby'],['active','Active hands'],['history','History'],['credits','My Credits'],['leaderboard','Leaderboard'],['privacy','Privacy']] as const).map(([value,label])=><TabsTrigger key={value} value={value} className="min-h-11 rounded-none px-2 py-3 text-sm font-black data-active:bg-acid">{label}</TabsTrigger>)}</TabsList>
            <TabsContent value="tables" className="mt-5">
              <PlayLaunchpad practice={()=>setPracticeOpen(true)} quickSeat={quickSeat} hasSeat={availableSeats.length>0} loading={tablesLoading&&tableCount!==0n} address={address} credits={creditData} totals={leaderData?.[1]}/>
              <details className="mb-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-ink/75">Community stats</summary><ArenaPulse hands={handHistory.filter(hand=>!hand.voided)} contenders={leaderData?.[0]?.length||0}/></details>
              {!contractReady ? <Empty icon={X} title="CONTRACT NOT CONFIGURED" body="Set NEXT_PUBLIC_FHEBLUFF_CONTRACT_ADDRESS to the deployed Arbitrum Sepolia contract. No demo tables are substituted for chain state." /> : tablesLoading&&tableCount!==0n ? <output className="block border-2 border-ink bg-white p-6 font-bold">Finding live tables…</output> : openRows.length===0 ? <Empty icon={Spade} title="NO TABLES TAKING SEATS" body="Start a friends table above, or practice while you wait. Finished hands are in History." /> : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{openRows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)} />)}</div>}
            </TabsContent>
            <TabsContent value="active" className="mt-5">{activeRows.length===0?<Empty icon={Activity} title="NO ACTIVE HANDS" body="Hands in progress will appear here with their current street and pot."/>:<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{activeRows.map(({id,data})=><TableCard key={id.toString()} id={id} data={data!} onOpen={()=>setSelected(id)}/>)}</div>}</TabsContent>
            <TabsContent value="history" className="mt-5"><HandHistory hands={handHistory} loading={historyLoading} error={historyError} onOpen={setSelected}/></TabsContent>
            <TabsContent value="credits" className="mt-5"><Profile address={address} credits={number(creditData)} authenticated={authenticated} login={login}/></TabsContent>
            <TabsContent value="leaderboard" className="mt-5"><Leaderboard address={address} data={leaderData as readonly [readonly `0x${string}`[],readonly bigint[]]|undefined} /></TabsContent>
            <TabsContent value="privacy" className="mt-5"><PrivacyPanel /></TabsContent>
          </Tabs>
        </section>
      </div>
      {selected!==null && <GameTable key={selected.toString()} id={selected} address={address} close={()=>{setSelected(null);window.history.replaceState(null,'','/play');}} transact={transact} busy={submissionLocked} notify={setNotice} />}
      {practiceOpen&&<PracticeTable close={()=>setPracticeOpen(false)} playRanked={()=>{setPracticeOpen(false);quickSeat();}}/>}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t-3 border-ink bg-cream sm:hidden">{([['tables',Users,'Lobby'],['active',Activity,'Hands'],['history',History,'History'],['credits',Coins,'Credits'],['leaderboard',Trophy,'Ranks'],['privacy',ShieldCheck,'Privacy']] as const).map(([value,Icon,label])=><button onClick={()=>setAppView(value)} key={value} className={`grid min-h-16 place-items-center text-xs font-black ${appView===value?'bg-acid':''}`}><Icon className="size-5" />{label}</button>)}</nav>
    </main>
  );
}

function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="block"><span className="mb-1 block font-mono text-sm font-bold uppercase">{label}</span>{children}</label>}
function Empty({icon:Icon,title,body}:{icon:typeof Spade,title:string,body:string}){return <div className="border-3 border-ink bg-white p-8 text-center shadow-hard sm:p-14"><Icon className="mx-auto size-14"/><h2 className="mt-5 font-heading text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-lg font-semibold text-ink/65">{body}</p></div>}
function ArenaPulse({hands,contenders}:{hands:HandResult[],contenders:number}){const chips=hands.reduce((sum,hand)=>sum+number(hand.pot),0);const biggest=hands.reduce((max,hand)=>Math.max(max,number(hand.pot)),0);return <section className="mb-5 overflow-hidden border-3 border-ink bg-ink text-white shadow-hard"><div className="flex items-center justify-between border-b-2 border-white/25 bg-purple px-4 py-3"><span className="flex items-center gap-2 font-black"><Radio className="size-4 animate-pulse"/> ARENA PULSE</span><span className="font-mono text-xs text-acid">LIVE · ARBITRUM SEPOLIA</span></div><div className="grid grid-cols-2 sm:grid-cols-4"><ArenaStat icon={Swords} label="HANDS FOUGHT" value={hands.length}/><ArenaStat icon={Coins} label="CHIPS CONTESTED" value={chips}/><ArenaStat icon={Flame} label="BIGGEST POT" value={biggest}/><ArenaStat icon={Trophy} label="RANKED PLAYERS" value={contenders}/></div></section>}
function ArenaStat({icon:Icon,label,value}:{icon:typeof Spade,label:string,value:number}){return <div className="border-r border-t border-white/20 p-4 last:border-r-0 sm:border-t-0"><Icon className="size-5 text-acid"/><strong className="mt-2 block text-2xl">{value.toLocaleString()}</strong><span className="font-mono text-xs text-white/75">{label}</span></div>}

function TableCard({id,data,onOpen}:{id:bigint,data:TableView,onOpen:()=>void}){
  const phase=number(data[5]);const filled=number(data[4]);const capacity=number(data[1]);const open=phase===0&&filled<capacity;
  return <article className="table-list-card border-3 border-ink bg-white p-4 shadow-hard"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold text-purple">TABLE #{id.toString()}</span><span className="border border-ink/20 bg-cream px-2 py-1 text-sm font-bold">{open?filled?'Players waiting':'Ready for friends':PHASES[phase]||'Updating'}</span></div><h3 className="mt-4 flex items-baseline gap-2"><strong className="font-heading text-3xl">{filled}/{capacity}</strong><span className="text-base text-ink/75">players</span></h3><div aria-label={`${filled} of ${capacity} seats occupied`} className="mt-3 flex gap-2">{Array.from({length:capacity},(_,i)=><span aria-hidden="true" key={i} className={`h-2 flex-1 border border-ink ${i<filled?'bg-purple':'bg-cream'}`}/>)}</div><div className="my-4 flex justify-between gap-3 text-base"><span><small className="block text-ink/75">Blinds</small><b>{number(data[2])}/{number(data[2])*2}</b></span><span className="text-right"><small className="block text-ink/75">{open?'Free starting stack':'Current pot'}</small><b>{number(open?data[3]:data[7]).toLocaleString()} chips</b></span></div><button onClick={onOpen} className={`brutal-button min-h-11 w-full py-2 ${open?'bg-acid':'bg-white'}`}>{open?'VIEW TABLE · TAKE A SEAT':'WATCH HAND'}</button></article>;
}


function Leaderboard({address,data}:{address?:string,data?:readonly[readonly `0x${string}`[],readonly bigint[]]}){const players=data?.[0]||[];const totals=data?.[1]||[];return <div className="border-3 border-ink bg-white shadow-hard"><div className="flex items-center justify-between border-b-3 border-ink bg-acid p-5"><div><p className="font-mono text-xs font-bold">THE CLIMB IS ONCHAIN</p><h2 className="font-heading text-3xl">CREDITS BOARD</h2></div><Crown/></div><div className="space-y-3 p-4 sm:p-5">{players.length===0?<p className="border-3 border-dashed border-ink p-8 text-center font-black">NO COMPLETED HANDS YET</p>:players.map((player,i)=>{const credits=number(totals[i]);const playerTier=tier(credits);return <div key={player} className={`grid grid-cols-[42px_1fr_auto] items-center gap-3 border-3 border-ink p-3 sm:grid-cols-[56px_1fr_auto] sm:p-4 ${player.toLowerCase()===address?.toLowerCase()?'bg-green':'bg-cream'}`}><span className="font-heading text-2xl">#{i+1}</span><span className="min-w-0"><span className="block truncate font-mono text-sm font-bold sm:text-base">{avatar(player)} {short(player)}{player.toLowerCase()===address?.toLowerCase()?' · YOU':''}</span><span className={`mt-1 inline-block border border-ink px-1.5 py-0.5 font-mono text-xs font-black ${playerTier.color}`}>{playerTier.name}</span></span><strong>{credits} CR</strong></div>})}<p className="pt-2 text-base font-semibold text-ink/75">Read directly from the contract. Every tied winner receives one non-transferable Credit.</p></div></div>}
function Profile({address,credits,authenticated,login}:{address?:string,credits:number,authenticated:boolean,login:()=>void}){const playerTier=tier(credits);const floor=credits>=15?15:credits>=7?7:credits>=3?3:credits>=1?1:0;const progress=credits>=15?100:Math.round(((credits-floor)/(playerTier.next-floor))*100);const achievements=[['FIRST POT','Win 1 hand',credits>=1],['TRIPLE THREAT','Win 3 hands',credits>=3],['CIPHER ACE','Win 7 hands',credits>=7],['FHE LEGEND','Win 15 hands',credits>=15]] as const;return <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><div className="border-3 border-ink bg-white p-6 shadow-hard"><div className="flex items-center gap-4"><div className="grid size-16 place-items-center border-3 border-ink bg-purple font-heading text-3xl text-acid">{avatar(address)}</div><div className="min-w-0"><p className="font-mono text-sm font-bold text-purple">CONNECTED PLAYER</p><h2 className="truncate font-heading text-2xl sm:text-3xl">{address?short(address):'NOT CONNECTED'}</h2><span className={`mt-1 inline-block border-2 border-ink px-2 py-1 font-mono text-xs font-black ${playerTier.color}`}>{playerTier.name}</span></div></div><div className="mt-6 grid grid-cols-2 gap-3"><StatCard label="CREDITS" value={credits}/><StatCard label="NETWORK" value="ARB SEP"/></div><div className="mt-4"><div className="mb-1 flex justify-between font-mono text-xs font-bold"><span>RANK PROGRESS</span><span>{credits>=15?'MAX RANK':`${credits}/${playerTier.next} CR`}</span></div><div className="h-4 border-2 border-ink bg-cream"><div className="h-full bg-pink transition-all" style={{width:`${progress}%`}}/></div></div>{!authenticated&&<button onClick={login} className="brutal-button mt-5 w-full bg-pink py-4">CONNECT PROFILE</button>}</div><div className="border-3 border-ink bg-acid p-6 shadow-hard"><Target className="size-10"/><h3 className="mt-5 font-heading text-3xl">ACHIEVEMENTS</h3><div className="mt-4 grid grid-cols-2 gap-2">{achievements.map(([name,goal,unlocked])=><div key={name} className={`border-2 border-ink p-3 ${unlocked?'bg-white':'bg-ink/15 opacity-55'}`}><span className="text-lg">{unlocked?'★':'◆'}</span><p className="mt-1 text-sm font-black">{name}</p><p className="font-mono text-xs">{goal}</p></div>)}</div><p className="mt-4 text-sm font-semibold">Milestones are derived from onchain Credits—not transferable tokens or pay-to-win perks.</p></div></div>}
function StatCard({label,value}:{label:string,value:string|number}){return <div className="border-3 border-ink bg-cream p-4"><span className="font-mono text-sm font-bold opacity-55">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>}
function PrivacyPanel(){return <div className="grid gap-4 lg:grid-cols-3">{[[LockKeyhole,'ENCRYPTED DEAL','Players contribute encrypted entropy. Hole-card handles receive wallet-specific ACL grants.'],[EyeOff,'NO SIDE CHANNELS','Card values never appear in events, transaction logs, or public plaintext storage.'],[ShieldCheck,'VERIFIED REVEAL','Street and showdown reveals require threshold-network signatures verified by CoFHE.']].map(([Icon,t,b])=><div key={String(t)} className="border-3 border-ink bg-white p-6 shadow-hard"><Icon className="size-10 text-purple"/><h3 className="mt-8 text-xl font-black">{String(t)}</h3><p className="mt-3 font-semibold leading-relaxed text-ink/65">{String(b)}</p></div>)}</div>}

function GameTable({id,address,close,transact,busy,notify}:{id:bigint,address?:`0x${string}`,close:()=>void,busy:boolean,notify:(notice:TransactionFeedback)=>void,transact:(name:'joinTable'|'leaveTable'|'startHand'|'act'|'forceTimeoutFold'|'abortStalledHand',args:readonly unknown[])=>void}){
  const [inviteStatus,setInviteStatus]=useState('');
  const [privacyStatus,setPrivacyStatus]=useState('');
  const [actionFeed,setActionFeed]=useState<ActionEntry[]>([]);
  const [lastResult,setLastResult]=useState<HandResult|null>(null);
  const [smallBatches,setSmallBatches]=useState(false);
  const [now,setNow]=useState(0);
  const privateLock=useRef(false);const [privateLocked,setPrivateLocked]=useState(false);
  const publicClient=usePublicClient(); const {data:walletClient}=useWalletClient(); const {writeContractAsync:writePrivate}=useWriteContract();
  const privateSubmittedHash=useRef<`0x${string}`|undefined>(undefined);
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
  const me=seats?.[0].findIndex(x=>x.toLowerCase()===address?.toLowerCase())??-1;
  const stage=number(table?.[5])===8?'CLOSED':PHASES[number(table?.[5])]||'LOADING';
  const timedOut=number(table?.[10])>0&&now>number(table?.[10]);
  const shuffleBatches=Math.ceil(number(shuffleRemaining)/4);
  const phase=number(table?.[5]);
  const cardView=usePrivateCards(id,table?.[6],address,me>=0&&phase>=2&&phase<=7);
  const privateCards=cardView.cards;
  const isMyTurn=phase>=2&&phase<=5&&me>=0&&seats?.[3][me]===0&&number(table?.[9])===me;
  const joinable=phase===0||phase===7;
  const tableFull=number(table?.[4])>=number(table?.[1]);
  const tableStatus=!table?'SYNCING':phase===8?'TABLE CLOSED · NO ACTIONS':phase===7?'HAND COMPLETE · READY FOR NEXT':phase===0?'SEATING · WAITING FOR PLAYERS':isMyTurn?'YOUR TURN':`SEAT ${number(table[9])+1} TO ACT`;
  const revealed=community?.length??0;
  const recover=recoveryAction(phase,number(table?.[10]),now,seats?.[3][number(table?.[9])],revealed);
  const expectedBoard=phase===3?3:phase===4?4:phase===5?5:0;
  const needsBoardReveal=expectedBoard>revealed;
  const allInRunout=seats ? seats[3].every(state=>state!==0) : false;
  const revealLabel=allInRunout?'RUN OUT BOARD':phase===3?'REVEAL FLOP':phase===4?'REVEAL TURN':'REVEAL RIVER';
  const privateBusy=privateLocked;
  const seatCredits=(seatCreditData||[]).map(entry=>entry.status==='success'?number(entry.result as bigint):0);
  const secondsLeft=Math.max(0,number(table?.[10])-now);
  const clockPercent=Math.min(100,(secondsLeft/120)*100);
  const potRatio=number(table?.[2])?number(table?.[7])/(number(table?.[2])*2):0;
  const heat=potRatio>=20?'INFERNO':potRatio>=8?'HEATING UP':'CALM';
  const insight=privateCards.length?handInsight([...privateCards,...(community||[]).map(Number)]):'';
  const inviteFriend=async()=>{const url=new URL('/play',window.location.origin);url.searchParams.set('table',id.toString());try{await navigator.clipboard.writeText(url.toString());setInviteStatus('Invite copied — send it to a friend');}catch{setInviteStatus(url.toString());}};
  const makeMove=(action:number,amount=0n)=>{if(busy||privateBusy)return;transact('act',[id,action,amount]);};
  const connectCofhe=async()=>{if(!publicClient||!walletClient)throw new Error('Connect a wallet first');await cofheClient.connect(publicClient as never,walletClient as never);};
  const runPrivateTask=async(task:()=>Promise<void>)=>{
    if(busy||privateLock.current)return;
    privateLock.current=true;privateSubmittedHash.current=undefined;setPrivateLocked(true);
    notify({kind:'pending',title:'Preparing your move',message:'Working on your private cards. A wallet request may follow.'});
    try{await task();}catch(error){const feedback=transactionError(error,privateSubmittedHash.current);setPrivacyStatus(feedback.message);notify(feedback);}
    finally{privateLock.current=false;setPrivateLocked(false);}
  };
  const freshPrivateWrite=async(request:Parameters<typeof writePrivate>[0])=>{
    if(!publicClient||!address)throw new Error('Network client unavailable');
    await publicClient.simulateContract({...request,account:address} as never);
    const fees=await publicClient.estimateFeesPerGas({type:'eip1559'});
    setPrivacyStatus('Check your wallet to continue.');
    notify({kind:'pending',title:'Your wallet is ready',message:'Open your wallet to approve or cancel this request.'});
    const hash=await writePrivate({...request,maxFeePerGas:fees.maxFeePerGas*2n,maxPriorityFeePerGas:fees.maxPriorityFeePerGas} as never);
    privateSubmittedHash.current=hash;
    setPrivacyStatus('Confirming on Arbitrum Sepolia…');
    notify({kind:'pending',title:'Move sent',message:'Waiting for confirmation on Arbitrum Sepolia.',hash});
    const receipt=await publicClient.waitForTransactionReceipt({hash});
    if(receipt.status!=='success')throw new Error('Transaction reverted');
    notify({kind:'success',title:'Move confirmed',message:'Your action is confirmed onchain.',hash});
    await Promise.allSettled([refetchView(),refetchSeats(),refetchCommunity(),refetchShuffle(),refetchEntropy()]);
  };
  const advanceEncryptedShuffle=()=>void runPrivateTask(async()=>{
    setPrivacyStatus(smallBatches?'Preparing a smaller deal batch…':'Combining the private deal into one confirmation…');
    const remaining=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'getShuffleProgress',args:[id]});
    if(!remaining)throw new Error('InvalidPhase');
    if(smallBatches)await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'advanceShuffle',args:[id,Math.min(4,remaining)]});
    else await freshPrivateWrite({address:DEAL_ROUTER,abi:multicall3Abi,functionName:'aggregate3',args:[buildDealCalls(POKER_ADDRESS,id,remaining)]} as never);
    setPrivacyStatus(smallBatches?'Deal batch confirmed.':'Private deal confirmed. View your cards below.');
  });
  const submitEncryptedEntropy=()=>void runPrivateTask(async()=>{setPrivacyStatus('Generating private entropy and ZK proof…');await connectCofhe();const words=new BigUint64Array(2);crypto.getRandomValues(words);const entropy=(words[0]<<64n)|words[1];const [handle,proof]=await cofheClient.encryptInputs([Encryptable.uint128(entropy)]).setConsumingContract(POKER_ADDRESS).execute();await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:'submitEntropy',args:[id,handle,proof]});setPrivacyStatus('Private entropy confirmed.');});
  const publishReveal=(showdown=false)=>void runPrivateTask(async()=>{setPrivacyStatus('Requesting threshold-signed reveal…');await connectCofhe();const functionName=showdown?'getShowdownHandles':'getCommunityHandles';const handles=await publicClient!.readContract({address:POKER_ADDRESS,abi:fheBluffAbi,functionName,args:[id]}) as readonly `0x${string}`[];const revealed=await Promise.all(handles.map(h=>cofheClient.decryptForTx(h).withoutACP().execute()));await freshPrivateWrite({address:POKER_ADDRESS,abi:fheBluffAbi,functionName:showdown?'settleShowdown':'publishCommunity',args:[id,revealed.map(x=>Number(x.decryptedValue)),revealed.map(x=>x.signature)]} as never);setPrivacyStatus(showdown?'Hand settled.':'Board revealed.');});
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#191917] text-white"><header className="sticky top-0 z-20 flex items-center justify-between border-b-3 border-white/25 bg-ink px-3 py-3 sm:px-6"><button onClick={close} className="flex items-center gap-2 font-black"><ArrowLeft/> LOBBY</button><div className="text-center"><p className="font-mono text-xs text-acid">TABLE #{id.toString()}</p><p className="font-black">{stage}</p></div><div className="border-2 border-acid px-3 py-2 font-mono text-sm">POT {number(table?.[7])}</div></header><div className="poker-layout mx-auto grid max-w-7xl">
    <TableGuide phase={phase} seated={me>=0} host={address?.toLowerCase()===table?.[0].toLowerCase()} players={number(table?.[4])} full={tableFull} submitted={!!entropySubmitted} batches={shuffleBatches===0?0:smallBatches?shuffleBatches:1} myTurn={isMyTurn} due={Math.min(number(seats?.[1][me]),Math.max(0,number(table?.[8])-number(seats?.[2][me])))} boardPending={needsBoardReveal} folded={seats?.[3][me]===1} allIn={seats?.[3][me]===2} busy={busy||privateBusy}/>
    <div><div className="mb-2 grid grid-cols-5 border-2 border-white/25 text-center font-mono text-xs font-black sm:text-xs">{['PREFLOP','FLOP','TURN','RIVER','SHOWDOWN'].map((label,index)=><span key={label} className={`border-r border-white/20 px-1 py-2 last:border-r-0 ${phase===index+2?'bg-acid text-ink':phase>index+2?'bg-green text-ink':'text-white/75'}`}>{phase>index+2?'✓ ':''}{label}</span>)}</div><div className="grid grid-cols-4 gap-2 text-center"><Stat label="CURRENT BET" value={number(table?.[8])}/><Stat label="YOUR STACK" value={me>=0?number(seats?.[1][me]):0}/><Stat label="HAND" value={`#${number(table?.[6])}`}/><Stat label="CLOCK" value={phase>=2&&phase<=6&&number(table?.[10])>0?`${secondsLeft}s`:'—'}/></div>{phase>=2&&phase<=6&&number(table?.[10])>0&&<div className="h-1 bg-white/15"><div className={`h-full transition-all ${secondsLeft<30?'bg-pink':'bg-acid'}`} style={{width:`${clockPercent}%`}}/></div>}</div>
    <div className="poker-scene">
      <PokerArena capacity={number(table?.[1])} phase={stage} status={tableStatus} pot={number(table?.[7])} address={address} board={community||[]} seats={(seats?.[0]||[]).map((player,i)=>({player,stack:number(seats?.[1][i]),bet:number(seats?.[2][i]),state:seats?.[3][i]||0,active:phase>=2&&phase<=5&&!needsBoardReveal&&number(table?.[9])===i,credits:seatCredits[i]||0}))}/>
      <aside className="border-3 border-white/25 bg-ink p-3 shadow-[5px_5px_0_#6c45ff]">
        <div className="flex items-center justify-between border-b-2 border-white/20 pb-3"><div><p className="font-mono text-xs text-white/75">TABLE ENERGY</p><p className={`font-heading text-2xl ${heat==='INFERNO'?'text-pink':heat==='HEATING UP'?'text-acid':'text-green'}`}>{heat}</p></div><Flame className="size-8 text-pink" aria-hidden="true"/></div>
        {phase===7&&lastResult&&lastResult.handId===table?.[6]&&<div className="winner-burst mt-3 border-2 border-acid bg-acid p-3 text-ink"><Sparkles className="size-5"/><p className="mt-2 font-heading text-2xl">POT CLAIMED!</p><p className="font-mono text-xs font-bold">{lastResult.winners.map(short).join(' + ')}</p><strong>{number(lastResult.pot)} CHIPS</strong></div>}
        <div className="mt-4"><div className="flex items-center justify-between"><p className="font-mono text-xs font-bold text-acid">FROM THE RAIL</p><Activity className="size-4 text-pink"/></div><div className="mt-2 space-y-2">{actionFeed.length===0?<p className="border border-dashed border-white/25 p-3 text-center text-sm text-white/75">The next move is yours to watch. Bets and folds appear here live.</p>:actionFeed.map(entry=><div key={`${entry.transactionHash}-${entry.player}`} className="border-l-2 border-acid bg-white/5 p-2"><p className="font-mono text-xs text-white/75">{avatar(entry.player)} {short(entry.player)}</p><p className="text-sm font-black">{ACTION_NAMES[entry.action]||'ACTED'}{entry.amount>0n?` · ${number(entry.amount)}`:''}</p></div>)}</div></div>
      </aside>
    </div>
    <div aria-label="Game controls" className="poker-controls border-3 border-ink bg-cream p-3 text-ink shadow-hard">
      {phase===8?<div className="mb-3 border-3 border-ink bg-white p-4"><p className="font-heading text-2xl">ARCHIVED TABLE</p><p className="mt-1 text-base font-semibold text-ink/65">The final player left, permanently closing this table. No wallet transaction is required here.</p></div>:<div className="private-hand flex items-center justify-between">
        <div className="flex gap-2"><PlayingCard value={privateCards[0]} hidden={privateCards.length===0}/><PlayingCard value={privateCards[1]} hidden={privateCards.length===0}/></div>
        <div className="max-w-[60%] text-right"><p className="font-mono text-xs font-bold">PRIVATE HAND</p><p className="text-sm font-semibold text-purple"><LockKeyhole className="inline size-3"/> {privateCards.length?'DECRYPTED LOCALLY':'ACP LOCKED'}</p>{insight&&<p className="mt-1 inline-flex items-center gap-1 border-2 border-ink bg-acid px-2 py-1 text-xs font-black"><Target className="size-3"/>{insight}</p>}<p className="mt-1 text-sm font-bold leading-relaxed text-ink/75">{cardView.message||privacyStatus}</p></div>
      </div>}
      {(phase===0||phase===7)&&<div className="mb-3"><button onClick={inviteFriend} className="min-h-11 border-2 border-ink bg-white px-3 text-base font-black">Copy friend invite</button>{inviteStatus&&<output className="mt-1 block break-all text-sm">{inviteStatus}</output>}</div>}
      {cardView.busy&&<output className="card-progress flex items-center justify-between gap-2 text-sm text-purple"><strong>{cardView.stage==='authorizing'?'Check wallet for permission':'CoFHE unlocking cards'} · {cardView.elapsed}s</strong>{cardView.stage==='decrypting'&&<button onClick={cardView.stop} className="min-h-11 px-3 text-sm font-bold underline">Stop waiting</button>}</output>}
      {recover&&<div className="mb-3 border-2 border-ink bg-white p-3"><p className="text-base font-black">{recover==='abortStalledHand'?'Deal expired · no chips at risk':'Player clock expired'}</p><p className="mt-1 text-sm">{recover==='abortStalledHand'?'Close this undealt hand as no contest. All stacks stay unchanged; no Credits are awarded.':'The timed-out player folds. The remaining player wins, or the hand continues with the remaining players.'}</p><button disabled={busy||privateBusy} onClick={()=>transact(recover,[id])} className="brutal-button mt-2 min-h-11 w-full bg-acid text-sm disabled:opacity-50">{recover==='abortStalledHand'?'CLOSE HAND · 0 NET CHIPS':'RESOLVE TIMED-OUT TURN'}</button></div>}
      <fieldset disabled={busy||privateBusy} className="min-w-0 disabled:opacity-60">
      {!table?<div className="border-3 border-ink bg-white p-4 text-center font-black">SYNCING TABLE STATE…</div>
      : phase===8?<button onClick={close} className="brutal-button w-full bg-acid py-4">BACK TO LOBBY · CREATE A NEW TABLE</button>
      : me<0 ? !joinable?<div className="border-3 border-ink bg-white p-4 text-center"><p className="font-black">SPECTATING · HAND IN PROGRESS</p><p className="mt-1 text-sm font-semibold text-ink/75">Seats reopen after the hand is settled.</p></div>
      : tableFull?<div className="border-3 border-ink bg-white p-4 text-center"><p className="font-black">TABLE FULL</p><p className="mt-1 text-sm font-semibold text-ink/75">Watch this table or choose another from the lobby.</p></div>
      : <button onClick={()=>transact('joinTable',[id,BigInt(table[3])])} className="brutal-button w-full bg-acid py-4">TAKE A SEAT · {number(table[3])} FREE CHIPS</button>
      : phase===0||phase===7 ? <div className="grid grid-cols-2 gap-2"><button onClick={()=>transact('leaveTable',[id])} className="brutal-button bg-white py-4">LEAVE TABLE</button>{address?.toLowerCase()===table?.[0]?.toLowerCase()&&(seats?.[1].filter(stack=>stack>0n).length||0)>=2?<button onClick={()=>transact('startHand',[id])} className="brutal-button bg-pink py-4">START HAND</button>:<div className="grid place-items-center border-3 border-ink bg-white p-2 text-center text-sm font-black">WAITING FOR HOST</div>}</div>
      : phase===1 ? timedOut ? <p className="border-2 border-ink bg-white p-3 text-center text-sm">Use Close hand above to record this deal as no contest.</p>
      : number(shuffleRemaining)>0 ? <div><p className="mb-3 text-base font-bold">{smallBatches?`${shuffleBatches} smaller batches left`:'Finish the encrypted deal with one wallet confirmation.'}</p><button disabled={privateBusy} onClick={advanceEncryptedShuffle} className="brutal-button w-full bg-acid py-4 disabled:opacity-50"><ShieldCheck/> {privateBusy?'DEALING…':smallBatches?'DEAL NEXT BATCH':'DEAL ALL CARDS'}</button><button onClick={()=>setSmallBatches(value=>!value)} className="mt-2 min-h-11 w-full text-sm font-bold underline">{smallBatches?'Use one-confirmation deal':'Having gas-estimation trouble? Use smaller batches'}</button></div>
      : entropySubmitted ? <div className="border-3 border-ink bg-white p-4 text-center font-black">READY · WAITING FOR OTHER PLAYERS</div>
      : <button disabled={privateBusy} onClick={submitEncryptedEntropy} className="brutal-button w-full bg-purple py-4 text-white disabled:cursor-wait disabled:opacity-50"><LockKeyhole/> {privateBusy?'TRANSACTION IN PROGRESS':'READY MY PRIVATE CARDS'}</button>
      : phase===6 ? <button disabled={privateBusy} onClick={()=>publishReveal(true)} className="brutal-button w-full bg-pink py-4 disabled:cursor-wait disabled:opacity-50"><ShieldCheck/> {privateBusy?'FINDING WINNER…':'SHOW WINNER · AWARD CREDITS'}</button>
      : needsBoardReveal ? <button disabled={privateBusy} onClick={()=>publishReveal(false)} className="brutal-button w-full bg-green py-4 disabled:cursor-wait disabled:opacity-50"><ShieldCheck/> {privateBusy?'REVEALING…':revealLabel}</button>
      : <><div className="mb-2 grid grid-cols-2 gap-2"><button disabled={privateBusy||cardView.busy||privateCards.length>0} onClick={()=>void cardView.load()} className="min-h-12 border-2 border-ink bg-white px-3 py-2 text-sm font-black disabled:cursor-wait disabled:opacity-50"><Eye/> {cardView.busy?'UNLOCKING CARDS…':privateCards.length?'CARDS VISIBLE':'SHOW MY CARDS · NO GAS'}</button>{recover==='forceTimeoutFold'?<button onClick={()=>transact('forceTimeoutFold',[id])} className="min-h-12 border-2 border-ink bg-pink px-3 py-2 text-sm font-black">SKIP TIMED-OUT PLAYER</button>:<div className="grid place-items-center border-2 border-ink bg-white px-2 text-center font-mono text-xs font-bold">{isMyTurn?<span className="flex items-center gap-1 text-purple"><Timer className="size-3"/> YOUR MOVE · {secondsLeft}s</span>:'WAITING FOR PLAYER'}</div>}</div>{isMyTurn?<BettingControls key={`${table?.[6]}:${phase}:${number(table?.[8])}`} stack={number(seats?.[1][me])} bet={number(seats?.[2][me])} currentBet={number(table?.[8])} pot={number(table?.[7])} bigBlind={number(table?.[2])*2} onMove={makeMove}/>:<div className="border-3 border-ink bg-white p-3 text-center text-base font-black">Your buttons appear when it’s your turn.</div>}</>}
      </fieldset>
    </div>
  </div></div>
}
function Stat({label,value}:{label:string,value:string|number}){return <div className="border-2 border-white/30 bg-black/30 p-2"><span className="block font-mono text-xs text-white/75">{label}</span><strong>{value}</strong></div>}
