export type CreditsBoard=readonly[readonly `0x${string}`[],readonly bigint[]];
export function mergeCredits(boards:readonly(CreditsBoard|undefined)[],connected?:`0x${string}`,connectedCredits?:bigint):CreditsBoard{
  const scores=new Map<`0x${string}`,bigint>();
  for(const board of boards)board?.[0].forEach((player,i)=>{const key=player.toLowerCase() as `0x${string}`;scores.set(key,(scores.get(key)??0n)+(board[1][i]??0n));});
  if(connected&&connectedCredits!==undefined)scores.set(connected.toLowerCase() as `0x${string}`,connectedCredits);
  const sorted=[...scores].sort((a,b)=>a[1]===b[1]?a[0].localeCompare(b[0]):a[1]>b[1]?-1:1);
  return [sorted.map(([player])=>player),sorted.map(([,score])=>score)];
}
