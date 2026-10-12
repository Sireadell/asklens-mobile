/// <reference types="jest" />
/// <reference types="node" />
import { getTokenRisk } from '../src/lib/tokenRisk';

jest.mock('../src/lib/solRpc', () => ({
  cached: jest.fn((_k: string, load: () => Promise<any>) => load()),
  fetchJson: jest.fn(),
  rpc: jest.fn(),
  TOKEN_2022_PROGRAM: 'tok2022',
}));
const { fetchJson } = require('../src/lib/solRpc');

const MINT = 'So11111111111111111111111111111111111111112';
const info = { mintAuthority: null, freezeAuthority: null, decimals: 6, supply: '1000000' };
const dexWith = (usd: number) => ({
  pairs: [{ pairCreatedAt: Date.now() - 400 * 86400000, baseToken: { address: MINT, symbol: 'T', name: 'T' }, liquidity: { usd } }],
});

async function run(rug: any, usd = 50000) {
  fetchJson.mockImplementation(async (url: string) => {
    if (url.includes('rugcheck')) return rug;
    return dexWith(usd);
  });
  return getTokenRisk(MINT, { mintInfo: info });
}
const text = (r: any) => r.lines.map((l: any) => l.text);
const hasLocked = (r: any) => text(r).some((t: string) => t.includes('liquidity is locked'));

test('high locked share shows as info and never turns the answer green', async () => {
  const r = await run({ risks: [], lpLockedPct: 92.4, score_normalised: 5 });
  const l = r.lines.find((x) => x.text.includes('liquidity is locked'))!;
  expect(l).toEqual({ level: 'info', text: 'About 92% of the liquidity is locked.' });
  expect(r.verdict).toBe('unknown');
});

test('low locked share warns and raises caution', async () => {
  const r = await run({ risks: [], lpLockedPct: 4.2, score_normalised: 5 });
  const l = r.lines.find((x) => x.text.includes('liquidity is locked'))!;
  expect(l.level).toBe('warn');
  expect(l.text).toBe('Only 4% of the liquidity is locked. The creator may be able to pull the money out.');
  expect(r.verdict).toBe('caution');
});

test('middle share shows nothing', async () => {
  expect(hasLocked(await run({ risks: [], lpLockedPct: 50, score_normalised: 5 }))).toBe(false);
});

test('stablecoin at 0% and established token at 15% do not warn', async () => {
  const usdc = await run({ risks: [], lpLockedPct: 0, score_normalised: 1 }, 5_000_000);
  expect(hasLocked(usdc)).toBe(false);
  expect(usdc.verdict).toBe('unknown');
  const bonk = await run({ risks: [], lpLockedPct: 15.49, score_normalised: 7 }, 5_000_000);
  expect(hasLocked(bonk)).toBe(false);
  expect(bonk.verdict).toBe('unknown');
});

test('nothing about locking when there is no trading', async () => {
  fetchJson.mockImplementation(async (url: string) => (url.includes('rugcheck') ? { risks: [], lpLockedPct: 3 } : { pairs: [] }));
  const r = await getTokenRisk(MINT, { mintInfo: info });
  expect(hasLocked(r)).toBe(false);
});

test('missing fields add no new lines', async () => {
  const r = await run({ risks: [] });
  expect(hasLocked(r)).toBe(false);
  expect(text(r).some((t: string) => t.includes('RugCheck risk score'))).toBe(false);
});

test('risk score is info when low and warn at 50 or more', async () => {
  const low = await run({ risks: [], score_normalised: 7 });
  expect(low.lines.find((x) => x.text.startsWith('RugCheck risk score'))).toEqual({
    level: 'info',
    text: 'RugCheck risk score: 7 out of 100 (lower is safer).',
  });
  const high = await run({ risks: [], score_normalised: 50 });
  expect(high.lines.find((x) => x.text.startsWith('RugCheck risk score'))!.level).toBe('warn');
  expect(high.verdict).toBe('caution');
});
