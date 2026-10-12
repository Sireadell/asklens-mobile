// Run:  npx tsx scripts/test-evidence.ts
import { getLinkEvidence, onScamList } from '../src/lib/evidence';
import blocklist from '../src/data/blocklist.json';

const sample = (blocklist as any).domains.find((d: string) => /^[a-z0-9-]+\.[a-z]+$/.test(d) && d.includes('phantom'));
const cases: [string, (e: any[]) => boolean][] = [
  [`https://${sample}/claim`, (e) => e.some((x) => x.level === 'bad')],
  [`https://claim.${sample}/x`, (e) => e.some((x) => x.level === 'bad')],
  ['https://phantom.app', (e) => !e.some((x) => x.level !== 'info')],
  ['https://phantom-app-claim.xyz', (e) => e.some((x) => /copies phantom/.test(x.text))],
  ['https://phantomm.app', (e) => e.some((x) => /copies phantom/.test(x.text))],
  ['https://xn--phantm-9wa.app', (e) => e.some((x) => /hidden look-alike/.test(x.text))],
  ['https://8.8.8.8/x', (e) => e.some((x) => /number/.test(x.text))],
  ['bit.ly/abc', (e) => e.some((x) => /shortened/.test(x.text))],
];
(async () => {
  console.log('sample list entry:', sample, 'onScamList:', onScamList(sample));
  let fail = 0;
  for (const [u, ok] of cases) {
    const e = await getLinkEvidence(u);
    const pass = ok(e);
    if (!pass) fail++;
    console.log(pass ? 'PASS' : 'FAIL', u, JSON.stringify(e.map((x) => `${x.level}: ${x.text}`)));
  }
  process.exit(fail ? 1 : 0);
})();
