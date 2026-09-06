// Stable display IDs, independent of list order and contract-local numbering.
export function tableLabel(id:bigint,version:'legacy'|'ready'='ready'){
  return `${version==='legacy'?'CLUB':'SPADE'}-${(id+1n).toString().padStart(3,'0')}`;
}
