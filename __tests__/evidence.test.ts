/// <reference types="jest" />
/// <reference types="node" />
jest.mock('../src/lib/domainAge', () => ({ getDomainAgeDays: jest.fn() }));
import { getDomainAgeDays } from '../src/lib/domainAge';
import { getLinkEvidence, hostOf, onScamList } from '../src/lib/evidence';

const age = getDomainAgeDays as jest.Mock;
const listed = require('../src/data/blocklist.json').domains[0] as string;
beforeEach(() => age.mockReset());

describe('hostOf', () => {
  it('reads the host from links and bare domains', () => {
    expect(hostOf('https://Claim.Example.com/path?x=1')).toBe('claim.example.com');
    expect(hostOf('example.com/a')).toBe('example.com');
  });
  it('returns empty for junk', () => {
    expect(hostOf('http://')).toBe('');
  });
});

describe('onScamList', () => {
  it('matches a listed site and its subdomains', () => {
    expect(onScamList(listed)).toBe(true);
    expect(onScamList(`sub.${listed}`)).toBe(true);
  });
  it('does not match a clean site', () => {
    expect(onScamList('wikipedia.org')).toBe(false);
  });
});

describe('getLinkEvidence', () => {
  it('returns nothing for an unreadable link', async () => {
    expect(await getLinkEvidence('http://')).toEqual([]);
  });
  it('warns about a bare IP address and skips the age lookup', async () => {
    const out = await getLinkEvidence('http://123.12.8.15:34927/bin.sh');
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('warn');
    expect(age).not.toHaveBeenCalled();
  });
  it('flags a site on the scam list as bad', async () => {
    age.mockResolvedValue(1000);
    const out = await getLinkEvidence(`https://${listed}`);
    expect(out.some((e) => e.level === 'bad')).toBe(true);
  });
  it('flags a look-alike name', async () => {
    age.mockResolvedValue(1000);
    const out = await getLinkEvidence('https://claim-phantom-airdrop.xyz');
    expect(out.some((e) => e.level === 'warn' && /copies phantom\.app/.test(e.text))).toBe(true);
  });
  it('flags hidden look-alike letters', async () => {
    age.mockResolvedValue(1000);
    const out = await getLinkEvidence('https://xn--phantm-9ua.example');
    expect(out.some((e) => /hidden look-alike/.test(e.text))).toBe(true);
  });
  it('notes a shortened link and stops', async () => {
    const out = await getLinkEvidence('https://bit.ly/abc');
    expect(out).toEqual([expect.objectContaining({ level: 'info', text: expect.stringMatching(/shortened/) })]);
    expect(age).not.toHaveBeenCalled();
  });
  it('warns about a brand new site', async () => {
    age.mockResolvedValue(0);
    const out = await getLinkEvidence('https://brand-new-site.example');
    expect(out.find((e) => e.level === 'warn')?.text).toMatch(/Registered today/);
  });
  it('reads age bands in plain words', async () => {
    age.mockResolvedValue(20);
    expect((await getLinkEvidence('https://a.example')).pop()?.text).toBe('Registered 20 days ago.');
    age.mockResolvedValue(90);
    expect((await getLinkEvidence('https://a.example')).pop()?.text).toBe('Registered 3 months ago.');
    age.mockResolvedValue(800);
    expect((await getLinkEvidence('https://a.example')).pop()?.text).toBe('Registered 2 years ago.');
  });
  it('says so when the age cannot be read', async () => {
    age.mockResolvedValue(null);
    expect((await getLinkEvidence('https://a.example')).pop()?.text).toMatch(/Could not read/);
  });
});
