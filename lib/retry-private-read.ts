// Only use for read-only decryption requests, never signatures or transactions.
export async function retryPrivateRead<T>(operation:(active:()=>boolean)=>Promise<T>,current:()=>boolean,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),timeoutMs=45000):Promise<T>{
  for(let attempt=0;attempt<4;attempt++){
    if(!current())throw new Error('View stopped');
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const value=await Promise.race([operation(()=>active&&current()),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Card view timeout')),timeoutMs);})]);
      if(!current())throw new Error('View stopped');
      return value;
    }catch(error){
      const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
      const message=error instanceof Error?error.message:'';
      if(!current()||attempt===3||/ACP|PERMIT|AUTH|DENIED|401|403|4001/i.test(code)||/permission|not.?allowed|denied|rejected|invalid card/i.test(message))throw error;
    }finally{active=false;clearTimeout(timer);}
    await wait(Math.min(1000*2**attempt,8000));
  }
  throw new Error('Card view unavailable');
}
