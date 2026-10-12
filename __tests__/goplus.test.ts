/// <reference types="jest" />
import { readGoPlusAddress } from '../src/lib/goplus';

const clean = { code: 1, result: { sanctioned: '0', phishing_activities: '0', mixer: '0', number_of_malicious_contracts_created: '0' } };

describe('readGoPlusAddress', () => {
  it('says plainly when there are no flags', () => {
    const e = readGoPlusAddress(clean)!;
    expect(e).toHaveLength(1);
    expect(e[0].level).toBe('info');
  });
  it('marks sanctions and phishing as bad', () => {
    const e = readGoPlusAddress({ code: 1, result: { sanctioned: '1', phishing_activities: '1' } })!;
    expect(e.filter((x) => x.level === 'bad')).toHaveLength(2);
  });
  it('marks a mixer as a warning, not bad', () => {
    const e = readGoPlusAddress({ code: 1, result: { mixer: '1' } })!;
    expect(e[0].level).toBe('warn');
  });
  it('counts malicious contracts', () => {
    const e = readGoPlusAddress({ code: 1, result: { number_of_malicious_contracts_created: '3' } })!;
    expect(e[0]).toEqual({ level: 'bad', text: 'GoPlus: this address created 3 malicious contracts.' });
  });
  it('returns null for unreadable answers', () => {
    expect(readGoPlusAddress(null)).toBeNull();
    expect(readGoPlusAddress({ code: 0 })).toBeNull();
  });
});
