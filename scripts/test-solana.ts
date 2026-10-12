// @ts-nocheck
// Real-network checks for the Solana side. Run: npx tsx scripts/test-solana.ts
import { createHash } from 'crypto';
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMemoInstruction } from '@solana/spl-memo';
import { buildReceiptMemo } from '../src/solana/receipt';
import { sha256 } from '../src/solana/sha256';
import { getWalletProfile } from '../src/solana/profile';

let failed = 0;
const ok = (c: boolean, name: string, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!c) failed++;
};

async function main() {
  // sha256 matches node crypto, including non-ASCII
  for (const s of ['', 'abc', 'https://example.com/a?b=1', 'héllo wörld 🚀', 'x'.repeat(200)]) {
    ok(sha256(s) === createHash('sha256').update(s).digest('hex'), 'sha256', JSON.stringify(s.slice(0, 12)));
  }

  const memo = buildReceiptMemo({ input: ' https://example.com ', verdict: 'danger', checkedAt: 1760000000000 });
  ok(/^AskLens\|v1\|danger\|[0-9a-f]{16}\|1760000000$/.test(memo), 'memo format', memo);

  // Profile of a known mainnet wallet
  const p = await getWalletProfile('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  ok(typeof p.solBalance === 'number', 'profile balance', String(p.solBalance));
  ok(typeof p.ageDays === 'number', 'profile age', String(p.ageDays));
  ok(typeof p.tokenCount === 'number' && p.tokenCount > 0, 'profile tokens (Zerion)', String(p.tokenCount));
  console.log('top:', JSON.stringify(p.topHoldings?.slice(0, 3)), 'flags:', p.flags);

  // Empty wallet
  const e = await getWalletProfile(Keypair.generate().publicKey.toBase58());
  ok(e.flags.includes('No activity found on this address'), 'empty wallet flag', JSON.stringify(e.flags));

  // Devnet memo from a throwaway keypair
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const kp = Keypair.generate();
  try {
    const sig0 = await conn.requestAirdrop(kp.publicKey, 0.1 * LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig0, ...bh }, 'confirmed');
  } catch (err: any) {
    console.log('SKIP devnet send, airdrop failed:', err.message);
    return;
  }
  const tx = new Transaction().add(createMemoInstruction(memo, [kp.publicKey]));
  const sig = await sendAndConfirmTransaction(conn, tx, [kp]);
  const got = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  const logs = (got?.meta?.logMessages ?? []).join(' ');
  ok(logs.includes('Memo') && logs.includes(memo), 'devnet memo on chain', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main()
  .catch((e) => {
    console.error('ERROR', e);
    failed++;
  })
  .finally(() => process.exit(failed ? 1 : 0));
