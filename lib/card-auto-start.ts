// One automatic attempt per hand/wallet context. Rejection and Stop must not loop prompts.
export function shouldAutoStartCards(enabled:boolean,visible:boolean,key:string,attemptedKey:string){
  return enabled&&visible&&key!==attemptedKey;
}
