'use client';

import {useState} from 'react';
import Image from 'next/image';

const quips=['Poker face: professionally suspicious.','Those sunglasses? Also encrypted.','Small fins. Big bluff energy.','I brought snacks. They’re poker chips.'];

export function PokerMascot(){
  const [reaction,setReaction]=useState(-1);
  return <section className="poker-mascot" aria-label="Card shark mascot">
    <button type="button" className="mascot-button" onClick={()=>setReaction(value=>(value+1)%quips.length)} aria-label="Tap the card shark for a playful reaction">
      <Image key={reaction} className={reaction>=0?'mascot-react':''} src="/card-shark.png" width={240} height={240} sizes="(max-width:1023px) 64px, 190px" alt="Purple poker shark wearing lime sunglasses and holding pink cards"/>
      <span className="mascot-tap">TAP FOR ATTITUDE ↗</span>
    </button>
    <p className="mascot-quip" aria-live="polite">{reaction<0?'Your unofficial bluff buddy.':quips[reaction]}</p>
  </section>;
}
