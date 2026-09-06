'use client';

import {useEffect,useRef,useState} from 'react';
import {Music2,VolumeX} from 'lucide-react';

// Original, quiet synthesized loop. No remote audio, trackers, or autoplay.
export function TableAudio(){
  const engine=useRef<{context:AudioContext;timer:ReturnType<typeof setInterval>}|null>(null);
  const starting=useRef(false);
  const mounted=useRef(true);
  const [playing,setPlaying]=useState(false);const [error,setError]=useState('');
  const stop=()=>{const active=engine.current;engine.current=null;if(active){clearInterval(active.timer);void active.context.close();}setPlaying(false);};
  useEffect(()=>{mounted.current=true;const pause=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',pause);return()=>{mounted.current=false;document.removeEventListener('visibilitychange',pause);const active=engine.current;if(active){clearInterval(active.timer);void active.context.close();}engine.current=null;};},[]);
  const toggle=async()=>{
    if(engine.current){stop();return;}if(starting.current)return;starting.current=true;setError('');
    let context:AudioContext|undefined;
    try{
      context=new AudioContext();await context.resume();
      if(!mounted.current||document.hidden){void context.close();return;}
      if(context.state!=='running')throw new Error('Audio blocked');
      const audio=context;const master=audio.createGain();master.gain.value=.07;master.connect(audio.destination);
      let step=0;let next=audio.currentTime+.02;
      const notes=[220,261.63,329.63,392,329.63,261.63,196,261.63,174.61,220,261.63,349.23,261.63,220,196,164.81];
      const schedule=()=>{while(next<audio.currentTime+.25){const osc=audio.createOscillator();const envelope=audio.createGain();osc.type='triangle';osc.frequency.value=notes[step++%notes.length];envelope.gain.setValueAtTime(0,next);envelope.gain.linearRampToValueAtTime(.5,next+.02);envelope.gain.exponentialRampToValueAtTime(.001,next+.32);osc.connect(envelope);envelope.connect(master);osc.start(next);osc.stop(next+.34);osc.onended=()=>{osc.disconnect();envelope.disconnect();};next+=.375;}};
      schedule();engine.current={context:audio,timer:setInterval(schedule,100)};setPlaying(true);
    }catch{if(context)void context.close();if(mounted.current)setError('Audio could not start. Check browser sound permissions and try again.');}
    finally{starting.current=false;}
  };
  return <div><button onClick={()=>void toggle()} aria-pressed={playing} aria-label={playing?'Mute table music':'Play table music'} className="flex min-h-11 items-center gap-2 border-2 border-white/30 px-3 text-xs font-black hover:bg-white/10">{playing?<Music2 className="size-4"/>:<VolumeX className="size-4"/>}{playing?'MUSIC ON':'MUSIC OFF'}</button>{error&&<output className="mt-1 max-w-48 text-xs">{error}</output>}</div>;
}
