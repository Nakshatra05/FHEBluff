export type PublicHandRecap={board:readonly number[];seats:{player:string;folded:boolean;cards?:number[]}[]};
export function publicHandRecap(board:readonly number[],players:readonly string[],states:readonly number[],values?:readonly number[]):PublicHandRecap|undefined{
  if(board.length>5||board.some(card=>!Number.isInteger(card)||card<0||card>51)||new Set(board).size!==board.length||players.length!==states.length)return;
  const eligible=states.filter(state=>state!==1&&state!==3).length;
  const reveal=values!==undefined&&board.length===5&&values.length===eligible*2&&values.every(card=>Number.isInteger(card)&&card>=0&&card<52)&&new Set([...board,...values]).size===board.length+values.length;
  let cursor=0;
  return {board,seats:players.map((player,i)=>{
    const eligible=states[i]!==1&&states[i]!==3;
    const cards=reveal&&eligible?values.slice(cursor,cursor+2):undefined;
    if(eligible)cursor+=2;
    return {player,folded:states[i]===1,cards};
  })};
}
