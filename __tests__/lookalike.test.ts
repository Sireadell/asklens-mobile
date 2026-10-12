/// <reference types="jest" />
/// <reference types="node" />
import { isPunycode, lookalikeOf, registrable } from '../src/lib/lookalike';

describe('registrable', () => {
  it('keeps the name you would buy', () => {
    expect(registrable('claim.phantom-app.xyz')).toBe('phantom-app.xyz');
    expect(registrable('PHANTOM.APP')).toBe('phantom.app');
  });
  it('handles two-part endings', () => {
    expect(registrable('shop.example.co.uk')).toBe('example.co.uk');
  });
});

describe('lookalikeOf', () => {
  it('lets the real sites and their subdomains through', () => {
    expect(lookalikeOf('phantom.app')).toBeNull();
    expect(lookalikeOf('docs.phantom.app')).toBeNull();
    expect(lookalikeOf('jup.ag')).toBeNull();
  });
  it('catches a one-letter typo', () => {
    expect(lookalikeOf('solflare.co')).toBe('solflare.com');
    expect(lookalikeOf('raydlum.io')).toBe('raydium.io');
  });
  it('catches a brand word hidden in another name', () => {
    expect(lookalikeOf('claim-phantom-airdrop.xyz')).toBe('phantom.app');
    expect(lookalikeOf('raydium-pool.top')).toBe('raydium.io');
  });
  it('ignores unrelated sites', () => {
    expect(lookalikeOf('example.com')).toBeNull();
    expect(lookalikeOf('wikipedia.org')).toBeNull();
  });
});

describe('isPunycode', () => {
  it('flags hidden look-alike letters', () => {
    expect(isPunycode('xn--phantm-9ua.app')).toBe(true);
    expect(isPunycode('www.xn--e1afmkfd.xn--p1ai')).toBe(true);
  });
  it('passes normal names', () => {
    expect(isPunycode('phantom.app')).toBe(false);
  });
});
