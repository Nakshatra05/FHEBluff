type Props={cardsVisible:boolean;acknowledged:boolean;busy:boolean;expired:boolean;seconds:number;onReady:()=>void;onClose:()=>void};
export function ReadyToPlay({cardsVisible,acknowledged,busy,expired,seconds,onReady,onClose}:Props){
  return <section className="border-3 border-ink bg-white p-3" aria-label="Start betting">
    <h3 className="text-lg font-black">{acknowledged?'You’re in · waiting for the others':'Ready to play?'}</h3>
    <p className="my-2 text-sm">Betting starts when everyone opts in. Preparation window: {seconds}s.</p>
    {!cardsVisible&&<p className="mb-3 border-l-4 border-pink pl-2 text-sm font-bold">You can play while cards load, or wait to see them first. Starting commits your blinds and starts the turn clock—even if your cards are still hidden. Cards keep loading automatically.</p>}
    {expired?<button disabled={busy} onClick={onClose} className="brutal-button bg-acid p-3 disabled:opacity-50">CLOSE DEAL · NO CHIPS LOST</button>:<button disabled={busy||acknowledged} onClick={onReady} className="brutal-button w-full bg-acid p-3 disabled:opacity-50">{acknowledged?'READY · WAITING FOR PLAYERS':cardsVisible?'LET’S PLAY':'PLAY WHILE CARDS LOAD'}</button>}
  </section>;
}
