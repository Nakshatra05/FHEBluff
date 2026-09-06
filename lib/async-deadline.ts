// Stops waiting locally; it does not pretend to cancel a wallet or network request.
// Callers must discard late results and must not use this to retry writes.
export async function withDeadline<T>(operation:Promise<T>,ms:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Card view timeout')),ms);})]);}
  finally{clearTimeout(timer);}
}
