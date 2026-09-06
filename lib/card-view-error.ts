// Never display SDK error.message/data: those may contain handles or permissions.
export function cardViewError(error:unknown):string{
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
  if(['ACP_DENIED','ACP_INVALID','ACP_EXPIRED','ACP_REQUIRED','ACP_MALFORMED'].includes(code))return 'Card permission could not be verified. Check that this is your seated wallet on Arbitrum Sepolia. Reconnect that wallet before retrying.';
  if(['CT_NOT_FOUND','CT_SOURCE_TIMEOUT','CT_SOURCE_ERROR'].includes(code))return 'This encrypted deal is still unavailable after automatic attempts. Reopen the table later to resume.';
  if(code==='4001'||(error instanceof Error&&/user rejected|user denied|request rejected/i.test(error.message)))return 'Card permission was declined. Reopen the table when you’re ready to authorize access.';
  return 'Card access is unavailable after waiting. Check your wallet connection and reopen the table to resume.';
}
