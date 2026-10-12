import { getTokenRisk } from '../lib/tokenRisk';

export const MAX_TOKENS_SCANNED = 15;

export interface RiskyToken {
  mint: string;
  symbol?: string;
  level: 'danger' | 'caution';
  reason: string; // plain words, from the first serious line
}

// Looks at up to 15 held mints, 4 at a time. Unknown results are not counted as risky.
export async function scanRiskyTokens(mints: string[]): Promise<{ risky: RiskyToken[]; scanned: number }> {
  const list = mints.slice(0, MAX_TOKENS_SCANNED);
  const risky: RiskyToken[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const out = await Promise.all(batch.map((m) => getTokenRisk(m).catch(() => null)));
    out.forEach((r, k) => {
      if (!r || (r.verdict !== 'danger' && r.verdict !== 'caution')) return;
      const line = r.lines.find((l) => l.level === 'bad') ?? r.lines.find((l) => l.level === 'warn');
      risky.push({ mint: batch[k], symbol: r.symbol, level: r.verdict, reason: line?.text ?? 'Looks risky' });
    });
  }
  return { risky, scanned: list.length };
}
