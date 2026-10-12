// @ts-nocheck
import { buildReceiptMemo } from '../src/solana/receipt';
import { parseMemo, proofFromTransaction, verifyProof } from '../src/solana/verify';
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const memo = buildReceiptMemo({ input: 'https://example.com', verdict: 'Danger', checkedAt: 1791800000000 });
ok('parse good memo', parseMemo(memo)?.verdict === 'Danger' && parseMemo(memo)?.checkedAt === 1791800000);
ok('reject other memo', parseMemo('hello') === null && parseMemo('AskLens|v2|a|b|1') === null);
const tx = (text, err = null) => ({ meta: { err }, transaction: { message: { accountKeys: [{ pubkey: 'Signer111', signer: true }], instructions: [{ programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', parsed: text }] } } });
const r = proofFromTransaction(tx(memo), 'sig', 'devnet');
ok('proof ok + signer', r.ok && r.signer === 'Signer111');
ok('not proof', proofFromTransaction(tx('hi'), 's', 'devnet').reason === 'not_proof');
ok('failed tx', proofFromTransaction(tx(memo, {}), 's', 'devnet').reason === 'failed_tx');
ok('not found', proofFromTransaction(null, 's', 'devnet').reason === 'not_found');
(async () => {
  ok('bad signature text', (await verifyProof('hello', 'devnet')).ok === false);
  const R = async (m, p) => (await (await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json()).result;
  const s = await R('getSignaturesForAddress', ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', { limit: 1 }]);
  const real = await verifyProof(s[0].signature, 'mainnet-beta');
  console.log('real mainnet memo tx ->', real.ok === false ? real.reason : 'ok?');
  const none = await verifyProof('1'.repeat(88), 'devnet');
  console.log('unknown signature ->', none.ok === false ? none.reason : 'ok?');
})();
const m2 = buildReceiptMemo({ input: 'x', verdict: 'Safe', checkedAt: 1791800000, streak: 4 });
ok('streak in memo', m2.endsWith('|s4') && parseMemo(m2)?.streak === 4);
ok('old memo no streak', parseMemo(buildReceiptMemo({ input: 'x', verdict: 'Safe', checkedAt: 1791800000 }))?.streak === undefined);
ok('bad streak field', parseMemo('AskLens|v1|Safe|0123456789abcdef|1791800000|zz') === null);
