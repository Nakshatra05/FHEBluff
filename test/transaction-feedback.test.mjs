import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionError} from '../lib/transaction-feedback.ts';

test('wallet timeout stays concise despite a long RPC request dump',()=>{
  const error=new Error('An unknown RPC error occurred. Request Arguments: maxFeePerGas: 0.5 gwei data: 0x'+ 'a'.repeat(10000)+' Details: Wallet timeout');
  const notice=transactionError(error);
  assert.equal(notice.kind,'info');assert.match(notice.title,/too long/);
  assert.ok(notice.message.length<150);assert.doesNotMatch(JSON.stringify(notice),/Request Arguments|0x|gwei|Docs:|maxFee/);
});
test('classifies nested rejection, pending request, and actual fee failure',()=>{
  assert.equal(transactionError({message:'RPC error',cause:{code:4001}}).title,'Request cancelled');
  assert.equal(transactionError({code:-32002}).title,'Your wallet is waiting');
  assert.equal(transactionError(new Error('max fee per gas less than block base fee')).title,'Network fee changed');
});
test('unconfirmed broadcast never tells the user to blindly resubmit',()=>{
  const hash='0x'+'1'.repeat(64);
  const notice=transactionError(new Error('Receipt timed out'),hash);
  assert.equal(notice.hash,hash);assert.equal(notice.title,'Confirmation still unverified');
  assert.match(notice.message,/before submitting again/);
  assert.equal(transactionError(new Error('Transaction reverted'),hash).kind,'error');
});
test('unknown errors and circular causes cannot leak private values',()=>{
  const error={details:'PRIVATE_PROOF_SECRET 0x123456789'};error.cause=error;
  assert.doesNotMatch(JSON.stringify(transactionError(error)),/PRIVATE_PROOF|123456789/);
  for(const error of [null,undefined,42,{},'private value'])assert.ok(transactionError(error).message.length<150);
});
