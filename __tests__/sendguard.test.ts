import { Contact, looksAlike, makeLookalike, matchContacts, SAMPLE_CONTACT_ADDRESS } from '../src/lib/lookalikeAddress';
import { applyMatch } from '../src/lib/sendGuard';
import type { CheckResult } from '../src/types';

const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
const mum = (address: string): Contact => ({ id: '1', name: 'Mum', address, addedAt: 0 });

// Same first 4 and last 4 characters, different middle.
const solFake = SOL.slice(0, 4) + 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' + SOL.slice(-4);
const evmFake = EVM.slice(0, 6) + '0'.repeat(32) + EVM.slice(-4);

const result = (input: string, kind: CheckResult['kind'], verdict: CheckResult['verdict'] = 'safe'): CheckResult => ({
  input,
  kind,
  verdict,
  reasons: ['ok'],
  source: 'test',
  checkedAt: 0,
});

describe('matching rules', () => {
  test('exact Solana match', () => {
    expect(matchContacts(SOL, [mum(SOL)]).kind).toBe('exact');
  });
  test('exact EVM match ignores letter case', () => {
    expect(matchContacts(EVM.toLowerCase(), [mum(EVM)]).kind).toBe('exact');
  });
  test('Solana look-alike: same start and end, different middle', () => {
    const m = matchContacts(solFake, [mum(SOL)]);
    expect(m.kind).toBe('lookalike');
    expect(m.kind === 'lookalike' && m.name).toBe('Mum');
  });
  test('EVM look-alike', () => {
    expect(matchContacts(evmFake, [mum(EVM)]).kind).toBe('lookalike');
  });
  test('a close edit (one character changed) counts as a look-alike', () => {
    const c = SOL.slice(0, 20) + (SOL[20] === 'a' ? 'b' : 'a') + SOL.slice(21);
    expect(looksAlike(c, SOL)).toBe(true);
  });
  test('a completely different address is none', () => {
    expect(matchContacts('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', [mum(SOL)]).kind).toBe('none');
  });
  test('empty contacts gives none', () => {
    expect(matchContacts(SOL, []).kind).toBe('none');
  });
  test('empty address gives none', () => {
    expect(matchContacts('', [mum(SOL)]).kind).toBe('none');
  });
  test('a Solana address never matches an EVM contact', () => {
    expect(matchContacts(SOL, [mum(EVM)]).kind).toBe('none');
  });
  test('exact wins over a look-alike in the same list', () => {
    expect(matchContacts(SOL, [mum(solFake), mum(SOL)]).kind).toBe('exact');
  });
  test('look-alike of a recent counterparty is found', () => {
    const m = matchContacts(solFake, [], [SOL]);
    expect(m.kind === 'lookalike' && m.from).toBe('recent');
  });
  test('the demo look-alike really is a different look-alike', () => {
    const fake = makeLookalike(SAMPLE_CONTACT_ADDRESS);
    expect(fake).not.toBe(SAMPLE_CONTACT_ADDRESS);
    expect(fake.slice(0, 4)).toBe(SAMPLE_CONTACT_ADDRESS.slice(0, 4));
    expect(fake.slice(-4)).toBe(SAMPLE_CONTACT_ADDRESS.slice(-4));
    expect(looksAlike(fake, SAMPLE_CONTACT_ADDRESS)).toBe(true);
  });
});

describe('effect on a result', () => {
  test('look-alike turns a safe result red with the warning first', () => {
    const r = applyMatch(result(solFake, 'solana-address'), [mum(SOL)], []);
    expect(r.verdict).toBe('danger');
    expect(r.reasons[0]).toBe("Looks like Mum's address but is NOT the same. Do not send.");
    expect(r.contactMatch?.kind).toBe('lookalike');
  });
  test('look-alike keeps an already dangerous verdict', () => {
    expect(applyMatch(result(solFake, 'solana-address', 'danger'), [mum(SOL)], []).verdict).toBe('danger');
  });
  test('exact match adds a note but never improves the verdict', () => {
    const r = applyMatch(result(SOL, 'solana-address', 'caution'), [mum(SOL)], []);
    expect(r.verdict).toBe('caution');
    expect(r.evidence?.[0].text).toBe("This is Mum's saved address.");
    expect(r.contactMatch?.kind).toBe('exact');
  });
  test('links are left alone', () => {
    const r = result('https://example.com', 'link');
    expect(applyMatch(r, [mum(SOL)], [])).toBe(r);
  });
  test('no match leaves the result unchanged', () => {
    const r = result(SOL, 'solana-address');
    expect(applyMatch(r, [], [])).toBe(r);
  });
});
