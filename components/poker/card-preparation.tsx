type Props={stage:string;elapsed:number;message:string;busy:boolean;onRetry:()=>void;onStop:()=>void;disabled:boolean;protectedDeal?:boolean};
export function CardPreparation({stage,message,onRetry,disabled}:Props){
  const retry=stage==='error'||(stage==='idle'&&!!message);
  if(!retry)return null;
  return <button title={message} disabled={disabled} onClick={onRetry} className="min-h-11 px-2 text-sm font-bold text-purple underline disabled:opacity-50">RETRY CARD ACCESS</button>;
}
