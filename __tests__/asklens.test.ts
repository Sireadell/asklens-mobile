/// <reference types="jest" />
/// <reference types="node" />
jest.mock('../src/lib/evidence', () => ({ getLinkEvidence: jest.fn() }));
jest.mock('../src/lib/classify', () => ({ classifyAddress: jest.fn() }));
jest.mock('../src/lib/tokenRisk', () => ({ getTokenRisk: jest.fn() }));
jest.mock('../src/lib/solanaBridge', () => ({ profileFor: jest.fn() }));
import { getLinkEvidence } from '../src/lib/evidence';
import { classifyAddress } from '../src/lib/classify';
import { profileFor } from '../src/lib/solanaBridge';
import { checkInput, detectKind, extractInput } from '../src/lib/asklens';

const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EVM = '0x' + 'ab'.repeat(20);
const evidence = getLinkEvidence as jest.Mock;
const classify = classifyAddress as jest.Mock;
const profile = profileFor as jest.Mock;
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

const reply = (data: any, ok = true, status = 200) => fetchMock.mockResolvedValue({ ok, status, json: async () => data });

beforeEach(() => {
  fetchMock.mockReset();
  evidence.mockReset().mockResolvedValue([]);
  classify.mockReset();
  profile.mockReset();
});

describe('detectKind', () => {
  it('knows links', () => {
    expect(detectKind('https://example.com/a')).toBe('link');
    expect(detectKind('example.com')).toBe('link');
  });
  it('knows 0x addresses', () => {
    expect(detectKind(EVM)).toBe('evm-address');
  });
  it('knows Solana addresses', () => {
    expect(detectKind(SOL)).toBe('solana-address');
  });
  it('gives unknown for anything else', () => {
    expect(detectKind('hello there')).toBe('unknown');
    expect(detectKind('0x123')).toBe('unknown');
    expect(detectKind('')).toBe('unknown');
  });
});

describe('extractInput', () => {
  it('finds a link inside shared text and trims trailing punctuation', () => {
    expect(extractInput('Check this out: https://example.com/claim!')).toBe('https://example.com/claim');
  });
  it('reads a solana: payment link', () => {
    expect(extractInput(`solana:${SOL}?amount=1`)).toBe(SOL);
  });
  it('finds an 0x address in text', () => {
    expect(extractInput(`send to ${EVM} please`)).toBe(EVM);
  });
  it('finds a Solana address in text', () => {
    expect(extractInput(`wallet ${SOL} thanks`)).toBe(SOL);
  });
});

describe('checkInput verdict mapping', () => {
  it('maps live checker answers for links', async () => {
    for (const [overall, verdict] of [['malicious', 'danger'], ['suspicious', 'caution'], ['safe', 'safe'], ['other', 'unknown']]) {
      reply({ overall, results: [{ ok: true, miner: 'm', reason: 'r' }], answeredCount: 1, totalCount: 3 });
      const r = await checkInput('https://example.com');
      expect(r.verdict).toBe(verdict);
      expect(r.kind).toBe('link');
    }
  });
  it('returns a full CheckResult shape', async () => {
    reply({ overall: 'safe', results: [{ ok: true, miner: 'm', reason: 'fine' }] });
    const r = await checkInput('https://example.com');
    expect(r).toMatchObject({ input: 'https://example.com', kind: 'link', verdict: 'safe', source: expect.any(String) });
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(typeof r.checkedAt).toBe('number');
    expect(r.reasons[0]).toBe('m: fine');
  });
  it('lets bad evidence upgrade a safe answer to danger', async () => {
    reply({ overall: 'safe', results: [] });
    evidence.mockResolvedValue([{ level: 'bad', text: 'scam list' }]);
    expect((await checkInput('https://example.com')).verdict).toBe('danger');
  });
  it('lets a warning upgrade safe to caution but never improve danger', async () => {
    reply({ overall: 'safe', results: [] });
    evidence.mockResolvedValue([{ level: 'warn', text: 'new' }]);
    expect((await checkInput('https://example.com')).verdict).toBe('caution');
    reply({ overall: 'malicious', results: [] });
    evidence.mockResolvedValue([{ level: 'info', text: 'old site' }]);
    expect((await checkInput('https://example.com')).verdict).toBe('danger');
  });
  it('falls back to phone evidence when the checkers fail', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    evidence.mockResolvedValue([{ level: 'warn', text: 'copy' }]);
    const r = await checkInput('https://example.com');
    expect(r.verdict).toBe('caution');
    expect(r.source).toMatch(/phone/);
  });
  it('maps wallet answers for 0x addresses', async () => {
    for (const [overall, verdict] of [['dangerous', 'danger'], ['caution', 'caution'], ['safe', 'safe']]) {
      reply({ overall, reason: 'why', miner: 'Sentinel' });
      const r = await checkInput(EVM);
      expect(r).toMatchObject({ kind: 'evm-address', verdict, reasons: ['why'] });
    }
  });
  it('never calls an inconclusive 0x answer safe', async () => {
    reply({ overall: 'safe', reason: 'INCONCLUSIVE: no data' });
    expect((await checkInput(EVM)).verdict).toBe('unknown');
  });
  it('gives unknown for text that is not a link or address', async () => {
    const r = await checkInput('hello there');
    expect(r).toMatchObject({ kind: 'unknown', verdict: 'unknown' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports a timeout in plain words', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const r = await checkInput(EVM);
    expect(r.verdict).toBe('unknown');
    expect(r.reasons[0]).toMatch(/too long/);
  });
});

describe('Solana addresses are never stamped safe', () => {
  it('warns on a program address', async () => {
    classify.mockResolvedValue({ kind: 'program' });
    const r = await checkInput(SOL);
    expect(r).toMatchObject({ kind: 'solana-address', verdict: 'caution', label: 'Program' });
  });
  it('warns on an address with no history', async () => {
    classify.mockResolvedValue({ kind: 'wallet' });
    profile.mockResolvedValue({ txCount: 0 });
    expect((await checkInput(SOL)).verdict).toBe('caution');
  });
  it('stays unknown for an older active wallet', async () => {
    classify.mockResolvedValue({ kind: 'wallet' });
    profile.mockResolvedValue({ txCount: 50, ageDays: 400, solBalance: 1.5 });
    const r = await checkInput(SOL);
    expect(r.verdict).toBe('unknown');
    expect(r.reasons.join(' ')).toMatch(/1\.500 SOL/);
  });
  it('cautions on a very new wallet', async () => {
    classify.mockResolvedValue({ kind: 'wallet' });
    profile.mockResolvedValue({ txCount: 3, ageDays: 2 });
    expect((await checkInput(SOL)).verdict).toBe('caution');
  });
  it('says so when the network cannot be read', async () => {
    classify.mockResolvedValue({ kind: 'wallet' });
    profile.mockResolvedValue(null);
    expect((await checkInput(SOL)).verdict).toBe('unknown');
  });
});
