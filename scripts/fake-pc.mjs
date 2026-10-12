// Pretends to be the PC helper. Usage:
//   node scripts/fake-pc.mjs pair [relayUrl]            -> prints code and QR text
//   node scripts/fake-pc.mjs send <secret> <pairId> <text> [relayUrl]
//   node scripts/fake-pc.mjs selftest [relayUrl]        -> full round trip against a relay
const [cmd, ...rest] = process.argv.slice(2);
const def = process.env.RELAY_URL || 'http://localhost:8787';
const post = async (relay, path, body, secret) => {
  const r = await fetch(relay + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-pair-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
if (cmd === 'pair') {
  const relay = rest[0] || def;
  const { data } = await post(relay, '/v1/pair', {});
  console.log('code:', data.code);
  console.log('qr:', JSON.stringify({ relay, pairId: data.pairId, secret: data.secret, code: data.code }));
} else if (cmd === 'send') {
  const [secret, pairId, text, relay = def] = rest;
  console.log(await post(relay, '/v1/send', { pairId, text }, secret));
} else if (cmd === 'selftest') {
  const relay = rest[0] || def;
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
  const a = (await post(relay, '/v1/pair', {})).data;
  ok(/^[A-HJ-NP-Z2-9]{8}$/.test(a.code), 'pair gives an 8 character code');
  const c = await post(relay, '/v1/claim', { code: a.code });
  ok(c.data.pairId === a.pairId && c.data.secret === a.secret, 'claim returns the same keys');
  const again = await post(relay, '/v1/claim', { code: a.code });
  ok(again.status === 404, 'a code works once');
  const t0 = Date.now() - 1000;
  const evP = fetch(`${relay}/v1/events?pairId=${a.pairId}&since=${t0}`, { headers: { 'x-pair-secret': a.secret } }).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 300));
  const s0 = Date.now();
  await post(relay, '/v1/send', { pairId: a.pairId, kind: 'link', text: 'https://example.com/x' }, a.secret);
  const ev = await evP;
  ok(ev.items?.length === 1 && ev.items[0].text === 'https://example.com/x', `long poll delivered the item in ${Date.now() - s0} ms`);
  const bad = await fetch(`${relay}/v1/events?pairId=${a.pairId}&since=0`, { headers: { 'x-pair-secret': 'wrong' } });
  ok(bad.status === 401, 'wrong secret is refused');
  await post(relay, '/v1/unpair', { pairId: a.pairId }, a.secret);
  const gone = await fetch(`${relay}/v1/events?pairId=${a.pairId}&since=0`, { headers: { 'x-pair-secret': a.secret } });
  ok(gone.status === 401, 'after unpair the keys stop working (phone shows "run out")');
} else console.log('commands: pair | send | selftest');
