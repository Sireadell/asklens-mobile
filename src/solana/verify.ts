import { Cluster, getCluster, rpcUrl } from './config';
import { fetchRetry } from './net';
import { friendlyError } from './errors';

const MEMO_PROGRAMS = ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'];

export type ProofResult =
  | { ok: true; verdict: string; inputHash: string; checkedAt: number; streak?: number; facts?: string; signer: string; cluster: Cluster; signature: string }
  | { ok: false; reason: 'not_found' | 'not_proof' | 'failed_tx'; message: string };

// Pure: turn a memo string into a proof, or null if it is not an AskLens memo.
export function parseMemo(memo: string): { verdict: string; inputHash: string; checkedAt: number; streak?: number; facts?: string } | null {
  const p = memo.trim().split('|');
  if (p.length < 5 || p.length > 7 || p[0] !== 'AskLens' || p[1] !== 'v1') return null;
  if (!/^[0-9a-f]{16}$/.test(p[3])) return null;
  const t = Number(p[4]);
  if (!Number.isFinite(t) || t <= 0) return null;
  const out: { verdict: string; inputHash: string; checkedAt: number; streak?: number; facts?: string } = { verdict: p[2], inputHash: p[3], checkedAt: t };
  for (const extra of p.slice(5)) {
    if (/^s[0-9]{1,4}$/.test(extra) && out.streak === undefined && out.facts === undefined) out.streak = Number(extra.slice(1));
    else if (/^f[0-9a-f]{12}$/.test(extra) && out.facts === undefined) out.facts = extra.slice(1);
    else return null;
  }
  return out;
}

// Pure: find the AskLens memo in a parsed transaction.
export function proofFromTransaction(tx: any, signature: string, cluster: Cluster): ProofResult {
  if (!tx) return { ok: false, reason: 'not_found', message: `Transaction not found on the ${cluster === 'devnet' ? 'test' : 'real'} network. Check the signature and the network switch.` };
  if (tx.meta?.err) return { ok: false, reason: 'failed_tx', message: 'That transaction failed on chain, so it proves nothing.' };
  const keys: any[] = tx.transaction?.message?.accountKeys ?? [];
  const signerKey = keys.find((k) => k.signer) ?? keys[0];
  const signer = String(signerKey?.pubkey ?? signerKey ?? '');
  const ixs: any[] = tx.transaction?.message?.instructions ?? [];
  for (const ix of ixs) {
    const pid = String(ix.programId ?? '');
    // Some wallets rerun the memo under their own program id, but the network still labels it spl-memo.
    if (!MEMO_PROGRAMS.includes(pid) && ix.program !== 'spl-memo') continue;
    const text = typeof ix.parsed === 'string' ? ix.parsed : '';
    const proof = parseMemo(text);
    if (proof) return { ok: true, ...proof, signer, cluster, signature };
  }
  return { ok: false, reason: 'not_proof', message: 'Not an AskLens proof. This transaction has no AskLens memo.' };
}

// Look up a signature on the chosen network (default: the current one) and read the memo.
export async function verifyProof(signature: string, cluster: Cluster = getCluster()): Promise<ProofResult> {
  const sig = signature.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(sig)) {
    return { ok: false, reason: 'not_found', message: 'That does not look like a transaction signature. It is about 88 letters and numbers.' };
  }
  try {
    const res = await fetchRetry(rpcUrl(cluster), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }],
      }),
    });
    const json = await res.json();
    if (json.error) {
      if (/invalid param|wrongsize/i.test(json.error.message ?? '')) return { ok: false, reason: 'not_found', message: 'That is not a valid transaction signature.' };
      throw new Error(json.error.message ?? 'RPC error');
    }
    return proofFromTransaction(json.result, sig, cluster);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}
