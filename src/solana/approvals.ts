import { rpcUrl } from './config';
import { fetchRetry } from './net';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const MAX_ACCOUNTS = 300;

export interface Approval {
  tokenAccount: string;
  mint: string;
  delegate: string;
  amount: number; // how much the app may still move
  balance: number; // what the token account holds now
  unlimited: boolean;
  programId: string;
}

export interface Holdings {
  approvals: Approval[];
  accountsChecked: number;
  capped: boolean;
  tokenAccounts: number; // accounts with a balance above zero
  mints: string[]; // mints with a balance above zero, biggest first
}

async function accountsFor(owner: string, programId: string): Promise<any[]> {
  const res = await fetchRetry(rpcUrl('mainnet-beta'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { programId }, { encoding: 'jsonParsed' }] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return (json.result?.value ?? []).map((v: any) => ({ ...v, programId }));
}

// Pure: pick the live approvals out of a list of parsed token accounts.
export function approvalsFrom(rows: any[]): Approval[] {
  const out: Approval[] = [];
  for (const r of rows) {
    const info = r.account?.data?.parsed?.info;
    if (!info?.delegate) continue;
    const delegated = Number(info.delegatedAmount?.uiAmount ?? 0);
    if (!(delegated > 0)) continue;
    const balance = Number(info.tokenAmount?.uiAmount ?? 0);
    const raw = BigInt(info.delegatedAmount?.amount ?? '0');
    out.push({
      tokenAccount: r.pubkey,
      mint: info.mint,
      delegate: info.delegate,
      amount: delegated,
      balance,
      unlimited: raw >= BigInt('18446744073709551615') / BigInt(2) || delegated >= balance,
      programId: r.programId,
    });
  }
  return out;
}

// Pure: mints the wallet holds a balance of, largest balance first, no repeats.
export function heldMints(rows: any[]): string[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const i = r.account?.data?.parsed?.info;
    const b = Number(i?.tokenAmount?.uiAmount ?? 0);
    if (i?.mint && b > 0) m.set(i.mint, (m.get(i.mint) ?? 0) + b);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// Read only. Always reads mainnet.
export async function getHoldings(owner: string): Promise<Holdings> {
  const [a, b] = await Promise.all([accountsFor(owner, TOKEN_PROGRAM), accountsFor(owner, TOKEN_2022_PROGRAM).catch(() => [])]);
  const all = [...a, ...b];
  const capped = all.length > MAX_ACCOUNTS;
  const rows = all.slice(0, MAX_ACCOUNTS);
  return {
    approvals: approvalsFrom(rows),
    accountsChecked: rows.length,
    capped,
    mints: heldMints(rows),
    tokenAccounts: rows.filter((r) => Number(r.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0) > 0).length,
  };
}

export async function getApprovals(owner: string): Promise<Approval[]> {
  return (await getHoldings(owner)).approvals;
}

// Names for the delegates people commonly see. Only listed after checking each address.
const KNOWN: Record<string, string> = {};
export const knownDelegate = (a: string): string | undefined => KNOWN[a];
