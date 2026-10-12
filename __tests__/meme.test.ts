/// <reference types="jest" />
/// <reference types="node" />
import { buildMemeReport, checkMeme, formatAge, formatMoney, formatPrice } from '../src/lib/memeVerdict';

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const MINT = 'So11111111111111111111111111111111111111112';
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600000;
const D = 24 * H;

const jup = (o: any = {}) => ({
  id: MINT, name: 'Testcoin', symbol: 'TEST', icon: 'https://x/y.png', holderCount: 5000, liquidity: 250000, usdPrice: 0.0123,
  firstPool: { createdAt: ago(40 * D) }, createdAt: ago(40 * D),
  audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 12, devBalancePercentage: 1, devMints: 1 },
  organicScore: 80, organicScoreLabel: 'high',
  stats5m: { priceChange: 1.234, buyVolume: 1000, buyOrganicVolume: 700, numBuys: 10, numSells: 8 },
  stats1h: { numBuys: 100, numSells: 90 },
  ...o,
});
const chain = (info: any = { mintAuthority: null, freezeAuthority: null }, token2022 = false) => ({ info, token2022 });
const dex = (pairs: any[] = [{ chainId: 'solana', dexId: 'raydium', pairCreatedAt: NOW - 40 * D, baseToken: { address: MINT, name: 'Testcoin', symbol: 'TEST' }, liquidity: { usd: 250000 } }]) => ({ pairs });
const build = (s: any, partial = false) => buildMemeReport(MINT, s, partial, NOW);

describe('verdict rules', () => {
  test('green only when clean and older than 7 days', () => {
    const r = build({ jupiter: jup(), chain: chain(), dex: dex(), rug: { risks: [] } });
    expect(r.verdict).toBe('safe');
    expect(r.sentence).toContain('no warning signs');
    expect(r.ageText).toBe('40 days');
  });

  test('nothing under 24 hours is ever green, even if everything else is clean', () => {
    const young = jup({ firstPool: { createdAt: ago(3 * H) }, createdAt: ago(3 * H) });
    const r = build({ jupiter: young, chain: chain(), dex: dex([]), rug: { risks: [] } });
    expect(r.verdict).toBe('caution');
    expect(r.reasons[0]).toBe('Only 3 hours old.');
    expect(r.sentence).toBe('Testcoin is 3 hours old and needs care because very new coins are the riskiest.');
  });

  test('between 1 and 7 days with no flags is not green', () => {
    const j = jup({ firstPool: { createdAt: ago(3 * D) }, createdAt: ago(3 * D) });
    expect(build({ jupiter: j, chain: chain(), dex: dex([]), rug: {} }).verdict).toBe('caution');
  });

  test('red when the creator can still print or freeze (new coin)', () => {
    const j = jup({ firstPool: { createdAt: ago(10 * D) }, createdAt: ago(10 * D), holderCount: 300, liquidity: 20000 });
    const r = build({ jupiter: j, chain: chain({ mintAuthority: 'abc', freezeAuthority: null }), dex: dex(), rug: {} });
    expect(r.verdict).toBe('danger');
    expect(r.reasons[0]).toBe('The creator can still print more of this coin.');
    const f = build({ jupiter: j, chain: chain({ mintAuthority: null, freezeAuthority: 'abc' }), dex: dex(), rug: {} });
    expect(f.verdict).toBe('danger');
    expect(f.reasons[0]).toContain('freeze');
  });

  test('uses Jupiter audit when the chain read is missing', () => {
    const j = jup({ audit: { mintAuthorityDisabled: false, freezeAuthorityDisabled: true, topHoldersPercentage: 5, devBalancePercentage: 0, devMints: 0 }, holderCount: 100, liquidity: 20000 });
    expect(build({ jupiter: j, chain: null, dex: dex(), rug: null }, true).verdict).toBe('danger');
  });

  test.each([
    ['permanentDelegate', 'Someone can take coins out of any wallet that holds this one.'],
    ['transferFeeConfig', 'Every transfer of this coin pays a fee to its creator.'],
    ['transferHook', 'A hidden program runs on every transfer and can block selling.'],
  ])('red for Token-2022 %s', (extension, text) => {
    const r = build({ jupiter: jup(), chain: chain({ mintAuthority: null, freezeAuthority: null, extensions: [{ extension }] }, true), dex: dex(), rug: {} });
    expect(r.verdict).toBe('danger');
    expect(r.reasons).toContain(text);
  });

  test('metadata-only Token-2022 extensions are not red', () => {
    const r = build({ jupiter: jup(), chain: chain({ mintAuthority: null, freezeAuthority: null, extensions: [{ extension: 'metadataPointer' }, { extension: 'tokenMetadata' }] }, true), dex: dex(), rug: {} });
    expect(r.verdict).toBe('safe');
  });

  test('red when people buy but nobody sells', () => {
    const j = jup({ stats1h: { numBuys: 60, numSells: 0 } });
    const r = build({ jupiter: j, chain: chain(), dex: dex(), rug: {} });
    expect(r.verdict).toBe('danger');
    expect(r.reasons[0]).toBe('People are buying but nobody has sold. You may not be able to sell.');
  });

  test('red when nobody can trade it', () => {
    const r = build({ jupiter: { none: true }, chain: chain(), dex: { pairs: [] }, rug: {} });
    expect(r.verdict).toBe('danger');
    expect(r.reasons[0]).toBe('Nobody can trade this coin right now.');
  });

  test('amber reasons: holders, dev share, dev launches, fake buying, low liquidity (shows at most 4)', () => {
    const j = jup({
      holderCount: 400, liquidity: 6000,
      audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 41, devBalancePercentage: 14, devMints: 6 },
      organicScoreLabel: 'low', stats5m: { buyVolume: 1000, buyOrganicVolume: 70, numBuys: 10, numSells: 5 },
    });
    const r = build({ jupiter: j, chain: chain(), dex: dex(), rug: {} });
    expect(r.verdict).toBe('caution');
    expect(r.reasons.length).toBe(4);
    expect(r.reasons.join(' ')).toContain('41%');
    expect(r.realBuyingPct).toBe(7);
  });

  test('top holders at exactly 30% stays green, over 30% turns amber', () => {
    const at = jup({ audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 30, devBalancePercentage: 10, devMints: 3 }, holderCount: 500, liquidity: 50000 });
    expect(build({ jupiter: at, chain: chain(), dex: dex(), rug: {} }).verdict).toBe('safe');
    const over = jup({ audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 30.5, devBalancePercentage: 10, devMints: 3 }, holderCount: 500, liquidity: 50000 });
    expect(build({ jupiter: over, chain: chain(), dex: dex(), rug: {} }).verdict).toBe('caution');
  });

  test('pump.fun pool is explained, not shown as a person', () => {
    const j = jup({
      firstPool: { createdAt: ago(20 * 60000) }, createdAt: ago(20 * 60000), holderCount: 150, liquidity: 15000,
      audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 38, devBalancePercentage: 1, devMints: 1 },
    });
    const d = dex([{ chainId: 'solana', dexId: 'pumpfun', pairCreatedAt: NOW - 20 * 60000, baseToken: { address: MINT }, liquidity: { usd: 15000 } }]);
    const r = build({ jupiter: j, chain: chain(), dex: d, rug: {} });
    expect(r.reasons).toContain('Top holders own 38%. On pump.fun part of that is the launch pool, not a person.');
    expect(r.sentence).toContain('20 minutes old and still on pump.fun');
  });

  test('a big established coin keeps its powers without turning red', () => {
    const j = jup({
      firstPool: { createdAt: ago(900 * D) }, createdAt: ago(900 * D), holderCount: 5000000, liquidity: 400000000,
      audit: { mintAuthorityDisabled: false, freezeAuthorityDisabled: false, topHoldersPercentage: 50, devBalancePercentage: 0, devMints: 20 },
      organicScoreLabel: 'low',
    });
    const r = build({ jupiter: j, chain: chain({ mintAuthority: 'a', freezeAuthority: 'b' }), dex: dex(), rug: {} });
    expect(r.verdict).toBe('caution');
    expect(r.reasons).toEqual(['The issuer can freeze coins in a wallet.', 'The issuer can still create more of this coin.']);
  });

  test('changeable metadata shows as a note and does not block green', () => {
    const r = build({ jupiter: jup(), chain: chain(), dex: dex(), rug: { risks: [{ name: 'Mutable metadata', level: 'warn' }] } });
    expect(r.verdict).toBe('safe');
    expect(r.reasons).toEqual(['The creator can still change the name and picture.']);
  });

  test('same facts give the same words', () => {
    const s = { jupiter: jup({ audit: { mintAuthorityDisabled: false } }), chain: chain(), dex: dex(), rug: {} };
    expect(build(s)).toEqual(build(s));
  });

  test('nothing landed means unknown, never green', () => {
    const r = build({ jupiter: null, chain: null, dex: null, rug: null }, true);
    expect(r.verdict).toBe('unknown');
    expect(r.partial).toBe(true);
    expect(r.sentence).toBe('Could not read this coin right now. Try again in a moment.');
  });

  test('clean but age unknown is not green', () => {
    const j = jup({ firstPool: undefined, createdAt: undefined });
    expect(build({ jupiter: j, chain: chain(), dex: { pairs: [] }, rug: {} }).verdict).not.toBe('safe');
  });

  test('report fields are plain text', () => {
    const r = build({ jupiter: jup(), chain: chain(), dex: dex(), rug: {} });
    expect(r.priceText).toBe('$0.012');
    expect(r.change5mText).toBe('+1.2%');
    expect(r.liquidityText).toBe('$250.0K');
    expect(r.dexScreenerUrl).toBe(`https://dexscreener.com/solana/${MINT}`);
    expect(r.holders).toBe(5000);
  });
});

describe('formatters', () => {
  test('age', () => {
    expect(formatAge(30 * 60000)).toBe('30 minutes');
    expect(formatAge(60000)).toBe('1 minute');
    expect(formatAge(5 * H)).toBe('5 hours');
    expect(formatAge(10 * D)).toBe('10 days');
    expect(formatAge(100 * D)).toBe('3 months');
  });
  test('money and price', () => {
    expect(formatMoney(512)).toBe('$512');
    expect(formatMoney(6337545)).toBe('$6.3M');
    expect(formatPrice(0.0000033)).toBe('$0.0000033');
    expect(formatPrice(1.5)).toBe('$1.50');
  });
});

describe('checkMeme with mocked sources', () => {
  const fetchMock = jest.fn();
  beforeAll(() => ((global as any).fetch = fetchMock));
  const ok = (data: any) => Promise.resolve({ ok: true, status: 200, json: async () => data });
  const chainReply = { result: { value: { owner: 'Tokenkeg', data: { parsed: { info: { mintAuthority: null, freezeAuthority: null } } } } } };

  test('sends reports as sources land, the final one is complete', async () => {
    const mint = 'Mint1111111111111111111111111111111111111111';
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('jup.ag')) return ok([jup({ id: mint })]);
      if (url.includes('dexscreener')) return ok(dex());
      if (url.includes('rugcheck')) return ok({ risks: [] });
      return ok(chainReply);
    });
    const seen: boolean[] = [];
    const r = await checkMeme(mint, (u) => seen.push(u.partial));
    expect(seen.length).toBe(4);
    expect(seen[0]).toBe(true);
    expect(r.partial).toBe(false);
  });

  test('a source that fails makes the report partial but still gives a verdict', async () => {
    const mint = 'Mint2222222222222222222222222222222222222222';
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('rugcheck')) return Promise.reject(new Error('down'));
      if (url.includes('jup.ag')) return ok([jup({ id: mint })]);
      if (url.includes('dexscreener')) return ok(dex());
      return ok(chainReply);
    });
    const r = await checkMeme(mint);
    expect(r.partial).toBe(true);
    expect(r.verdict).toBe('safe');
  });
});

import { buildReceiptMemo, factsHash } from '../src/solana/receipt';
import { parseMemo } from '../src/solana/verify';

describe('receipt carries a fingerprint of the words shown', () => {
  const lines = ['Testcoin is 3 hours old and needs care because very new coins are the riskiest.', 'Only 3 hours old.'];
  test('memo round trip with streak and words fingerprint', () => {
    const facts = factsHash('caution', lines);
    expect(facts).toMatch(/^[0-9a-f]{12}$/);
    const memo = buildReceiptMemo({ input: MINT, verdict: 'caution', checkedAt: 1791800000000, streak: 3, facts });
    expect(memo.endsWith(`|s3|f${facts}`)).toBe(true);
    expect(memo.length).toBeLessThan(120);
    expect(parseMemo(memo)).toEqual({ verdict: 'caution', inputHash: memo.split('|')[3], checkedAt: 1791800000, streak: 3, facts });
  });
  test('any changed word changes the fingerprint', () => {
    expect(factsHash('caution', lines)).not.toBe(factsHash('caution', [lines[0], 'Only 4 hours old.']));
    expect(factsHash('caution', lines)).toBe(factsHash('caution', lines));
  });
  test('older memos without the new parts still read', () => {
    expect(parseMemo('AskLens|v1|safe|0123456789abcdef|1791800000')?.facts).toBeUndefined();
    expect(parseMemo('AskLens|v1|safe|0123456789abcdef|1791800000|s2')?.streak).toBe(2);
    expect(parseMemo('AskLens|v1|safe|0123456789abcdef|1791800000|fzzzz')).toBeNull();
  });
});

describe('no green flash while sources are still loading', () => {
  test('build: checking holds a clean result back as unknown', () => {
    const s = { jupiter: jup(), chain: undefined, dex: dex() };
    const held = buildMemeReport(MINT, s, true, NOW, true);
    expect(held.verdict).toBe('unknown');
    expect(held.sentence).toBe('Checking...');
    expect(buildMemeReport(MINT, { ...s, chain: chain(), rug: {} }, false, NOW, false).verdict).toBe('safe');
  });

  test('checkMeme: no update says safe until the last source answers, then the final one is amber for a coin with mint power', async () => {
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const mint = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
    const ok = (data: any, wait = 0) => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: async () => data }), wait));
    const j = jup({ id: mint, holderCount: 46000, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 12, devBalancePercentage: 0, devMints: 0 } });
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('jup.ag')) return ok([j]);
      if (url.includes('dexscreener')) return ok(dex());
      if (url.includes('rugcheck')) return ok({ risks: [] }, 20);
      return ok({ result: { value: { owner: 'Tokenkeg', data: { parsed: { info: { mintAuthority: 'creator', freezeAuthority: null } } } } } }, 60);
    });
    const verdicts: string[] = [];
    const final = await checkMeme(mint, (u) => verdicts.push(u.verdict));
    expect(verdicts.length).toBe(4);
    expect(verdicts.slice(0, 3)).not.toContain('safe');
    expect(verdicts[0]).toBe('unknown');
    expect(final.verdict).toBe('caution');
  });
});
