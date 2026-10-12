import type { CheckResult } from '../types';

// The Solana code is large, so it is loaded the first time something needs it
// (saving a proof, reading a wallet), not when the app opens.
let solana: any = null;
let tried = false;
function getSolana(): any {
  if (!tried) {
    tried = true;
    try {
      solana = require('../solana');
    } catch {
      solana = null;
    }
  }
  return solana;
}

export const solanaReady = () => !!getSolana()?.saveReceipt;

export interface ReceiptOutcome {
  ok: boolean;
  signature?: string;
  explorerUrl?: string;
  message: string;
}

export async function saveProofOnSolana(result: CheckResult): Promise<ReceiptOutcome> {
  const solana = getSolana();
  if (!solana?.saveReceipt) {
    return { ok: false, message: 'Saving proof on Solana is not switched on in this build yet.' };
  }
  try {
    const out = await solana.saveReceipt(result);
    const signature = typeof out === 'string' ? out : out?.signature;
    return { ok: true, signature, explorerUrl: out?.explorerUrl, message: `Proof saved on Solana. Signed in ${(await solana.getWalletName?.()) ?? 'your wallet app'}.` };
  } catch (e: any) {
    const raw = e?.message ?? '';
    const message = solana.friendlyError
      ? solana.friendlyError(e)
      : /cancel|declin|reject/i.test(raw)
      ? 'You cancelled in your wallet. Nothing was saved.'
      : 'Could not save the proof. Make sure a Solana wallet app is installed, then try again.';
    return { ok: false, message };
  }
}

export async function profileFor(address: string): Promise<any | null> {
  const solana = getSolana();
  if (!solana?.getWalletProfile) return null;
  try {
    return await solana.getWalletProfile(address);
  } catch {
    return null;
  }
}

/** Explorer links of saved proofs, keyed by input + time of the check. */
export async function loadProofLinks(): Promise<Record<string, string>> {
  const solana = getSolana();
  const map: Record<string, string> = {};
  try {
    const all: any[] = (await solana?.getReceipts?.()) ?? [];
    for (const r of all) if (r.explorerUrl) map[`${r.input}|${r.checkedAt}`] = r.explorerUrl;
  } catch {}
  return map;
}

/** Connected wallet address, or null when no wallet is connected. */
export async function getConnectedAddressSafe(): Promise<string | null> {
  const solana = getSolana();
  try {
    return (await solana?.getConnectedAddress?.()) ?? null;
  } catch {
    return null;
  }
}

/** Holder tier for a wallet. Returns null if the Solana part is not in this build or cannot be read. */
export async function tierFor(address: string): Promise<{ tier: 'free' | 'holder'; skr: number } | null> {
  const solana = getSolana();
  if (!solana?.getGuardTier) return null;
  try {
    return await solana.getGuardTier(address);
  } catch {
    return null;
  }
}
