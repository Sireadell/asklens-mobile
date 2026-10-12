import type { CheckResult, Evidence, Verdict } from '../types';
import { Contact, matchContacts } from './lookalikeAddress';

// Send Guard: when an address is checked, compare it with saved contacts and with
// addresses the connected wallet dealt with lately. It can only make a result worse,
// except for the small "this is <name>'s saved address" note.

const RECENT_CUTOFF_MS = 2500;
const RECENT_TTL = 5 * 60 * 1000;
let recentCache: { wallet: string; at: number; list: string[] } | null = null;

function lazy<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

/** Addresses that recently moved money with the connected wallet. Never throws, gives up after 2.5 seconds. */
export async function recentCounterparties(wallet?: string | null): Promise<string[]> {
  try {
    if (!wallet) {
      const sol = lazy(() => require('../solana'));
      wallet = (await sol?.getConnectedAddress?.()) ?? null;
    }
    if (!wallet) return [];
    if (recentCache && recentCache.wallet === wallet && Date.now() - recentCache.at < RECENT_TTL) return recentCache.list;
    const { rpc } = require('./solRpc');
    const found = new Set<string>();
    const work = (async () => {
      const sigs: { signature: string }[] = await rpc('getSignaturesForAddress', [wallet, { limit: 10 }]);
      await Promise.all(
        sigs.map(async (s) => {
          try {
            const tx = await rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
            for (const k of tx?.transaction?.message?.accountKeys ?? []) {
              const key = typeof k === 'string' ? k : k?.pubkey;
              if (key && key !== wallet) found.add(key);
            }
          } catch {}
        })
      );
    })().catch(() => {});
    let timer: any;
    const finished = await Promise.race([work.then(() => true), new Promise<boolean>((r) => (timer = setTimeout(() => r(false), RECENT_CUTOFF_MS)))]);
    clearTimeout(timer);
    const list = [...found];
    // Only a full read is remembered, so a slow answer is retried next time.
    if (finished && list.length) recentCache = { wallet, at: Date.now(), list };
    return list;
  } catch {
    return [];
  }
}

const RANK: Record<Verdict, number> = { safe: 0, unknown: 1, caution: 2, danger: 3 };
const worse = (a: Verdict, b: Verdict): Verdict => (RANK[b] > RANK[a] ? b : a);

/** Pure: fold the match into a result. */
export function applyMatch(result: CheckResult, contacts: Contact[], recent: string[]): CheckResult {
  if (result.kind !== 'solana-address' && result.kind !== 'evm-address') return result;
  const m = matchContacts(result.input, contacts, recent);
  if (m.kind === 'none') return result;
  if (m.kind === 'exact') {
    if (m.from !== 'contact') return result;
    const note: Evidence = { level: 'info', text: `This is ${m.name}'s saved address.` };
    return { ...result, evidence: [note, ...(result.evidence ?? [])], contactMatch: { kind: 'exact', name: m.name } };
  }
  const text =
    m.from === 'contact'
      ? `Looks like ${m.name}'s address but is NOT the same. Do not send.`
      : 'Looks like an address you dealt with recently but is NOT the same. This is the address poisoning trick. Do not send.';
  return {
    ...result,
    verdict: worse(result.verdict, 'danger'),
    reasons: [text, ...result.reasons],
    evidence: [{ level: 'bad', text }, ...(result.evidence ?? [])],
    contactMatch: { kind: 'lookalike', name: m.name, address: m.address },
  };
}

/** Used by checkInput. Never throws and never slows a check by more than the cut-off. */
export async function applySendGuard(result: CheckResult): Promise<CheckResult> {
  try {
    if (result.kind !== 'solana-address' && result.kind !== 'evm-address') return result;
    const store = lazy(() => require('./contacts'));
    const contacts: Contact[] = (await store?.loadContacts?.()) ?? [];
    const recent = result.kind === 'solana-address' ? await recentCounterparties() : [];
    return applyMatch(result, contacts, recent);
  } catch {
    return result;
  }
}
