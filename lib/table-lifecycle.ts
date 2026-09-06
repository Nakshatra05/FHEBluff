export const isOpenTable=(phase:number,seats:number,capacity:number)=>phase===0&&seats<capacity;

// The deployed contract's timeout entry point is permissive. Never offer it
// while a board reveal is pending or the nominal actor is folded/all-in.
export function recoveryAction(phase:number,deadline:number,now:number,actorState:number|undefined,boardCount:number){
  if(!deadline||now<=deadline)return null;
  if(phase===1||phase===9)return 'abortStalledHand' as const;
  const expected=phase===3?3:phase===4?4:phase===5?5:0;
  if(phase>=2&&phase<=5&&actorState===0&&boardCount>=expected)return 'forceTimeoutFold' as const;
  return null;
}
