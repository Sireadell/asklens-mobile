// Run:  npx tsx scripts/test-classify.ts   (needs internet)
import { classifyAddress } from '../src/lib/classify';
import { checkInput } from '../src/lib/asklens';

const cases: [string, string][] = [
  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'token-mint'], // USDC
  ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'program'], // Memo program
  ['SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', 'token-mint'], // SKR
  ['4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T', 'wallet'], // funded wallet used in earlier tests, if it exists
  ['11111111111111111111111111111111', 'program'],
];
(async () => {
  let fail = 0;
  for (const [a, want] of cases) {
    const c = await classifyAddress(a);
    const ok = c.kind === want;
    if (!ok) fail++;
    console.log(ok ? 'PASS' : 'FAIL', a.slice(0, 8), 'wanted', want, 'got', c.kind);
  }
  for (const a of ['SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']) {
    const r = await checkInput(a);
    console.log('\n', a.slice(0, 8), r.label, r.verdict, '\n ', r.reasons.join('\n  '), '\n  evidence:', r.evidence?.map((e) => `${e.level}: ${e.text}`).join('\n    '));
  }
  process.exit(fail ? 1 : 0);
})();
