import type { Verdict } from '../types';
import { cached, fetchJson } from './solRpc';
import { getTokenRisk } from './tokenRisk';

// The shape of a coin report, shared with the coin engine in memeVerdict.ts.
export interface MemeReport {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  ageText: string;
  priceText: string;
  change5mText: string;
  liquidityText: string;
  holders?: number;
  topHoldersPct?: number;
  devPct?: number;
  realBuyingPct?: number;
  verdict: Verdict;
  sentence: string;
  reasons: string[];
  dexScreenerUrl: string;
  partial: boolean; // true while slower sources are still loading
}

/**
 * Checks one coin. Calls onUpdate each time more facts arrive, so the screen
 * can fill in as it goes. Uses the coin engine when it is in this build, and
 * falls back to a smaller local check (DexScreener + the token risk reader)
 * so the screen always works.
 */
export async function checkCoin(mint: string, onUpdate: (r: MemeReport) => void): Promise<MemeReport> {
  try {
    const engine = require('./memeVerdict');
    if (typeof engine.checkMeme === 'function') return await engine.checkMeme(mint, onUpdate);
  } catch {}
  return fallbackCheck(mint, onUpdate);
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function ageOf(ms: number | undefined): string {
  if (!ms) return 'Age unknown';
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} min old`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hours old`;
  return `${Math.round(h / 24)} days old`;
}

function priceText(p?: string | number): string {
  const n = Number(p);
  if (!n) return 'n/a';
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3).replace(/0+$/, '')}`;
}

async function fallbackCheck(mint: string, onUpdate: (r: MemeReport) => void): Promise<MemeReport> {
  const dex = await cached(`dex.${mint}`, () => fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)).catch(() => null);
  const pairs: any[] = (dex?.pairs ?? []).slice().sort((a: any, b: any) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0));
  const top = pairs[0];
  const liq = pairs.reduce((s, p) => s + Number(p.liquidity?.usd ?? 0), 0);
  const created = pairs.map((p) => Number(p.pairCreatedAt)).filter(Boolean).sort((a, b) => a - b)[0];
  const ch = top?.priceChange?.m5;

  const base: MemeReport = {
    mint,
    name: top?.baseToken?.name ?? 'Unknown coin',
    symbol: top?.baseToken?.symbol ?? '',
    imageUrl: top?.info?.imageUrl,
    ageText: ageOf(created),
    priceText: priceText(top?.priceUsd),
    change5mText: ch === undefined ? 'n/a' : `${ch > 0 ? '+' : ''}${ch}%`,
    liquidityText: pairs.length ? money(liq) : 'none',
    verdict: !dex ? 'unknown' : pairs.length === 0 ? 'danger' : liq < 5000 ? 'caution' : 'unknown',
    sentence: !dex
      ? 'Reading this coin...'
      : pairs.length === 0
      ? 'Nobody can trade this coin right now.'
      : `${ageOf(created)}. About ${money(liq)} backs it. Checking who controls it...`,
    reasons: [],
    dexScreenerUrl: `https://dexscreener.com/solana/${mint}`,
    partial: true,
  };
  onUpdate(base);

  const risk = await getTokenRisk(mint).catch(() => null);
  if (!risk) return { ...base, partial: false, sentence: base.sentence.replace(' Checking who controls it...', '') };

  const worst = risk.lines.find((l) => l.level === 'bad') ?? risk.lines.find((l) => l.level === 'warn');
  const young = created && Date.now() - created < 86400000;
  const verdict: Verdict = risk.verdict === 'danger' ? 'danger' : risk.verdict === 'caution' || young ? 'caution' : 'unknown';
  const sentence =
    verdict === 'danger'
      ? worst?.text ?? 'Nobody can trade this coin right now.'
      : verdict === 'caution'
      ? `${base.ageText}. ${worst?.text ?? 'Treat it as risky.'}`
      : 'No warning signs found. This is not a guarantee.';
  const out: MemeReport = {
    ...base,
    verdict,
    sentence,
    reasons: risk.lines.map((l) => l.text),
    partial: false,
  };
  onUpdate(out);
  return out;
}
