import { sha256 } from './sha256';

export interface ReceiptInput {
  input: string;
  verdict: string;
  checkedAt: number;
  streak?: number; // consecutive days with a saved proof, counting this one
}

// Compact memo, well under the 566 byte memo limit:
// AskLens|v1|<verdict>|<first 16 hex of sha256(input)>|<unix seconds>[|s<streak days>]
export function buildReceiptMemo(r: ReceiptInput): string {
  const inputHash = sha256(r.input.trim()).slice(0, 16);
  const seconds = Math.floor(r.checkedAt > 1e12 ? r.checkedAt / 1000 : r.checkedAt);
  const base = `AskLens|v1|${r.verdict}|${inputHash}|${seconds}`;
  return r.streak && r.streak > 0 ? `${base}|s${Math.floor(r.streak)}` : base;
}
