import { sha256 } from './sha256';

export interface ReceiptInput {
  input: string;
  verdict: string;
  checkedAt: number;
  streak?: number; // consecutive days with a saved proof, counting this one
  facts?: string; // hash of the verdict and the words shown (see factsHash)
}

// Compact memo, well under the 566 byte memo limit:
// AskLens|v1|<verdict>|<first 16 hex of sha256(input)>|<unix seconds>[|s<streak days>][|f<12 hex of the words shown>]
export function buildReceiptMemo(r: ReceiptInput): string {
  const inputHash = sha256(r.input.trim()).slice(0, 16);
  const seconds = Math.floor(r.checkedAt > 1e12 ? r.checkedAt / 1000 : r.checkedAt);
  const base = `AskLens|v1|${r.verdict}|${inputHash}|${seconds}`;
  let memo = base;
  if (r.streak && r.streak > 0) memo += `|s${Math.floor(r.streak)}`;
  if (r.facts) memo += `|f${r.facts}`;
  return memo;
}

// Fingerprint of what the user saw: the verdict and the plain-word lines. Changes if any word changes.
export function factsHash(verdict: string, lines: string[]): string {
  return sha256([verdict, ...lines].join('|')).slice(0, 12);
}
