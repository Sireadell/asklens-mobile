// @ts-nocheck
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { approvalsFrom, getHoldings } from '../src/solana/approvals';
import { computeGuardScore } from '../src/solana/score';
import { buildRevokeInstruction } from '../src/solana/revoke';
import { streakFrom } from '../src/solana/streak';
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
ok('score 100', computeGuardScore({ approvals: 0, risky: 0, ageDays: 400 }).score === 100);
ok('score with 2 approvals', computeGuardScore({ approvals: 2, risky: 0, ageDays: 400 }).score === 70);
ok('score cap + young', computeGuardScore({ approvals: 9, risky: 9, ageDays: 3 }).score === 13);
const row = (d, amt, bal) => ({ pubkey: 'TA', programId: 'Tok', account: { data: { parsed: { info: { mint: 'M', delegate: d, delegatedAmount: { amount: String(amt), uiAmount: amt / 1e6 }, tokenAmount: { uiAmount: bal } } } } } });
ok('approvalsFrom keeps live', approvalsFrom([row('D', 500e6, 1000), row(undefined, 0, 5), row('D', 0, 5)]).length === 1);
(async () => {
  const h = await getHoldings('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  console.log('real wallet: accounts', h.accountsChecked, 'approvals', h.approvals.length);
  const owner = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  const ix = buildRevokeInstruction('11111111111111111111111111111111', owner, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  ok('revoke ix shape', ix.data[0] === 5 && ix.keys.length === 2 && ix.keys[1].isSigner);
})();

const D = 86400000, now = Date.UTC(2026, 9, 12, 12);
ok('streak 3 days', streakFrom([{ savedAt: now }, { savedAt: now - D }, { savedAt: now - 2 * D }], now) === 3);
ok('streak kept until tonight', streakFrom([{ savedAt: now - D }], now) === 1);
ok('streak broken', streakFrom([{ savedAt: now - 3 * D }], now) === 0);
ok('streak while saving', streakFrom([{ savedAt: now - D }], now, true) === 2);
