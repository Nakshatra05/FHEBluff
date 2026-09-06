export type TransactionFeedback = {
  kind: 'pending' | 'success' | 'info' | 'error';
  title: string;
  message: string;
  hash?: `0x${string}`;
};

// Inspect error causes only to select fixed copy. Never return provider text,
// request arguments, calldata, proofs, or stack traces to the UI.
export function transactionError(error: unknown, hash?: `0x${string}`): TransactionFeedback {
  const parts: string[] = [];
  const codes: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  for (let depth=0; current && depth<8 && !seen.has(current); depth++) {
    seen.add(current);
    if (typeof current === 'string') { parts.push(current); break; }
    if (typeof current !== 'object') break;
    const value = current as {message?:unknown;shortMessage?:unknown;details?:unknown;code?:unknown;cause?:unknown};
    for (const part of [value.message,value.shortMessage,value.details]) if(typeof part==='string')parts.push(part);
    codes.push(value.code);
    current=value.cause;
  }
  const text=parts.join(' ');
  if(hash && !/transaction reverted/i.test(text))return {kind:'info',title:'Confirmation still unverified',message:'The transaction was sent, but we could not confirm its result. Check its status before submitting again.',hash};
  if(codes.includes(4001)||codes.includes('4001')||/user rejected|user denied|request cancelled|request canceled/i.test(text))return {kind:'info',title:'Request cancelled',message:'You cancelled the wallet request. You can try again when you’re ready.'};
  if(/timeout|timed out/i.test(text))return {kind:'info',title:'Wallet or network took too long',message:'Check your wallet for a pending request before trying again.'};
  if(codes.includes(-32002)||/already pending/i.test(text))return {kind:'info',title:'Your wallet is waiting',message:'Open your wallet and finish or cancel the existing request first.'};
  if(/insufficient funds/i.test(text))return {kind:'error',title:'Test ETH needed',message:'Add Arbitrum Sepolia test ETH to cover the network fee. Play chips are free.'};
  if(/max fee per gas less than|fee cap.*too low|base fee.*exceeds|fee.*below.*base/i.test(text))return {kind:'error',title:'Network fee changed',message:'Try the action again to request a fresh fee estimate.'};
  if(/revert|NotYourTurn|InvalidPhase|InvalidAction/i.test(text))return {kind:'error',title:'Move unavailable',message:'The table may have changed. Check the current hand before trying again.',hash};
  return {kind:'error',title:'Connection interrupted',message:'Check your wallet and network connection, then try the action again.'};
}
