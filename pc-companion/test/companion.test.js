'use strict';
// Run: node test/companion.test.js
const assert = require('assert');
const { classify, createDedupe } = require('../lib/detect');
const { checkLink, createAddressWatch } = require('../lib/precheck');

const results = [];
function t(name, fn) { try { fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); } }

t('link', () => assert.deepStrictEqual(classify('  https://example.com/a?b=1 '), { kind: 'link', text: 'https://example.com/a?b=1' }));
t('link in a sentence is ignored', () => assert.strictEqual(classify('look at https://example.com now'), null));
t('evm address', () => assert.strictEqual(classify('0x' + 'a'.repeat(40)).kind, 'evm-address'));
t('solana address', () => assert.strictEqual(classify('So11111111111111111111111111111111111111112').kind, 'solana-address'));
t('token mint (USDC)', () => assert.strictEqual(classify('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').kind, 'solana-address'));
t('long word is not an address', () => assert.strictEqual(classify('internationalizationlocalizationxx'), null));
t('password-like text ignored', () => assert.strictEqual(classify('Tr0ub4dor&3-correct-horse'), null));
t('empty and non-string', () => { assert.strictEqual(classify(''), null); assert.strictEqual(classify(null), null); });
t('dedupe', () => { let n = 0; const d = createDedupe(1000, () => n); assert.strictEqual(d.isRepeat('a'), false); assert.strictEqual(d.isRepeat('a'), true); n = 5000; assert.strictEqual(d.isRepeat('a'), false); });
t('real site passes', () => assert.strictEqual(checkLink('https://phantom.app/download'), null));
t('subdomain of real site passes', () => assert.strictEqual(checkLink('https://docs.phantom.app/x'), null));
t('fake of phantom blocked', () => assert.ok(checkLink('https://phantomm.app/')));
t('fake of uniswap blocked', () => assert.ok(checkLink('https://un1swap.org/')));
t('@ trick blocked', () => assert.ok(checkLink('https://phantom.app@evil.example/')));
t('blocklist', () => assert.ok(checkLink('https://bad.example/x', new Set(['bad.example']))));
t('unrelated site passes', () => assert.strictEqual(checkLink('https://example.com/'), null));
t('address poisoning warning', () => {
  const w = createAddressWatch();
  assert.strictEqual(w.check('0x1234' + 'a'.repeat(32) + 'abcd'), null);
  assert.ok(w.check('0x1234' + 'b'.repeat(32) + 'abcd'));
  assert.strictEqual(w.check('0x9999' + 'c'.repeat(32) + '0000'), null);
});

let bad = 0;
for (const [n, ok, m] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (m ? ' : ' + m : '')); if (!ok) bad++; }
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
