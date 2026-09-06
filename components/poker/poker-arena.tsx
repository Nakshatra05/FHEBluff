import {Coins,LockKeyhole,Spade,Users} from 'lucide-react';
import {DealerHost} from './dealer-host';

export type ArenaSeat={player:string;stack:number;bet:number;state:number;active:boolean;credits:number};
const short=(value:string)=>`${value.slice(0,4)}…${value.slice(-3)}`;

export function PlayingCard({value,hidden=false}:{value?:number;hidden?:boolean}){
  const valid=value!==undefined&&value>=0&&value<52;
  const rank=valid?['2','3','4','5','6','7','8','9','10','J','Q','K','A'][value%13]:'';
  const suit=valid?['♣','♦','♥','♠'][Math.floor(value/13)]:'';
  const red=valid&&(Math.floor(value/13)===1||Math.floor(value/13)===2);
  return <div aria-label={hidden?'Private card':valid?`${rank}${suit}`:'Unrevealed community card'} className={`playing-card ${hidden?'card-back':valid?`card-face card-pop ${red?'card-red':''}`:'card-slot'}`}>
    {hidden?<><LockKeyhole size={18}/><span className="card-back-label">FHE</span></>:valid?<><span className="card-corner">{rank}<small>{suit}</small></span><span className="card-suit">{suit}</span><span className="card-corner card-corner-bottom">{rank}<small>{suit}</small></span></>:<Spade size={22}/>}
  </div>;
}

export function PokerArena({seats,capacity,board,phase,status,pot,address}:{seats:ArenaSeat[];capacity:number;board:readonly number[];phase:string;status:string;pot:number;address?:string}){
  const count=Math.max(2,Math.min(6,capacity||2));
  const split=Math.ceil(count/2);
  const seat=(index:number)=>{
    const player=seats[index];
    if(!player)return <div key={index} className="arena-seat arena-seat-empty"><Users size={18}/><span>Open seat</span></div>;
    const self=player.player.toLowerCase()===address?.toLowerCase();
    return <div key={index} title={player.player} className={`arena-seat ${player.active?'arena-seat-active':''} ${player.state===1?'arena-seat-folded':''}`}>
      <div className="seat-identity"><span className="seat-avatar" aria-hidden="true">{['♠','♥','♦','♣'][index%4]}</span><span><b>{self?'YOU':short(player.player)}</b><small>{player.credits} CR{self?` · ${short(player.player)}`:''}</small></span></div>
      <div className="seat-stack"><strong>{player.stack.toLocaleString()}</strong><span>chips</span></div>
      <div className="seat-foot"><span>{player.state===1?'Folded':player.state===2?'All-in':player.state===3?'Sitting out':player.active?'To act':'In seat'}</span><b>Bet {player.bet}</b></div>
    </div>;
  };
  return <section aria-label="Poker table" className="poker-felt">
    <div className="arena-seats">{Array.from({length:split},(_,i)=>seat(i))}</div>
    <div className="arena-board">
      <DealerHost/>
      <div className="arena-stage"><span className="stage-dot"/>{phase.replaceAll('_',' ')}<span className="arena-stage-divider">/</span><span>{status}</span></div>
      <div className="community-cards">{Array.from({length:5},(_,i)=><PlayingCard key={i} value={board[i]}/>)}</div>
      <div className="arena-pot"><Coins aria-hidden="true"/><span><small>THE POT</small><strong key={pot}>{pot.toLocaleString()}<span> chips</span></strong></span></div>
    </div>
    <div className="arena-seats">{Array.from({length:count-split},(_,i)=>seat(i+split))}</div>
  </section>;
}
