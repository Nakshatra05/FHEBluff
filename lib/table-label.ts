// Stable display IDs, independent of list order and contract-local numbering.
export function tableLabel(id:bigint,version:'legacy'|'ready'|'instant'='ready'){
  return `${version==='legacy'?'CLUB':version==='ready'?'SPADE':'HEART'}-${(id+1n).toString().padStart(3,'0')}`;
}
