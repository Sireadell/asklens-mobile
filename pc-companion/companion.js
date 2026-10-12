#!/usr/bin/env node
'use strict';
// AskLens PC companion. Watches what you copy on this PC. When it is a link or
// a wallet address, it sends it to your phone through the relay so the
// AskLens Guard app can check it. Anything else you copy is ignored.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Change this one line when the relay has its final address.
const DEFAULT_RELAY = 'https://asklens-relay.onrender.com';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const flagValue = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const dir = process.env.ASKLENS_COMPANION_DIR ||
  path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'asklens-companion');
const pairFile = path.join(dir, 'pairing.json');
const pauseFile = path.join(dir, 'paused');

// What counts as worth sending. The whole copied text must BE a link or an
// address, so a paragraph that happens to contain one is left alone.
const LINK_RE = /^https?:\/\/\S+$/i;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function classify(text) {
  if (text.length > 2000) return null;
  if (LINK_RE.test(text)) return 'link';
  if (EVM_RE.test(text)) return 'evm-address';
  if (SOLANA_RE.test(text)) return 'solana-address';
  return null;
}

function short(text, kind) {
  if (kind === 'link') {
    try { return new URL(text).host; } catch { /* fall through */ }
  }
  return text.length > 20 ? text.slice(0, 8) + '...' + text.slice(-6) : text;
}

function readPairing() {
  try { return JSON.parse(fs.readFileSync(pairFile, 'utf8')); } catch { return null; }
}
function savePairing(p) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pairFile, JSON.stringify(p), { mode: 0o600 });
}

async function api(relay, method, route, body, secret) {
  const r = await fetch(relay + route, {
    method,
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-pair-secret': secret } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000), // a free relay can take a while to wake up
  });
  let json = null;
  try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}

function showPairing(p) {
  const line = '='.repeat(34);
  console.log('\n' + line);
  console.log('  Pairing code:   ' + p.code.split('').join(' '));
  console.log(line);
  console.log('\nOpen AskLens Guard on your phone, go to "Copy on PC" and type this code,');
  console.log('or scan the square below. The code works once and lasts 10 minutes.\n');
  try {
    require('qrcode-terminal').generate(
      JSON.stringify({ relay: p.relay, pairId: p.pairId, secret: p.secret, code: p.code }),
      { small: true },
      (qr) => console.log(qr)
    );
  } catch {
    console.log('(QR not available here, please type the code instead.)');
  }
}

function startClipboardWatcher(onText) {
  // One PowerShell stays open and reports each change, so we are not starting
  // a new process every half second.
  const script = `
$last = $null
while ($true) {
  try { $t = Get-Clipboard -Raw -ErrorAction Stop } catch { $t = $null }
  if ($t -ne $last) {
    $last = $t
    if ($t) { [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))) }
    else { [Console]::Out.WriteLine('') }
  }
  Start-Sleep -Milliseconds 500
}`;
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let buf = '';
  ps.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      onText(line ? Buffer.from(line, 'base64').toString('utf8') : '');
    }
  });
  ps.on('exit', () => { console.log('Clipboard watcher stopped. Please run the tool again.'); process.exit(1); });
  process.on('exit', () => ps.kill());
  return ps;
}

async function main() {
  if (flag('--help') || flag('-h')) {
    console.log([
      'AskLens PC companion',
      '',
      '  node companion.js              start (pairs the first time)',
      '  node companion.js --pause      stop sending without closing, until --resume',
      '  node companion.js --resume     start sending again',
      '  node companion.js --unpair     forget the phone and delete the saved pairing',
      '  node companion.js --relay URL  use a different relay (or set RELAY_URL)',
    ].join('\n'));
    return;
  }

  const wanted = flagValue('--relay') || process.env.RELAY_URL || null;
  let pairing = readPairing();

  if (flag('--pause')) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(pauseFile, '1'); console.log('Paused. Nothing you copy will be sent. Run with --resume to continue.'); return; }
  if (flag('--resume')) { try { fs.unlinkSync(pauseFile); } catch { /* not paused */ } console.log('Resumed.'); return; }

  if (flag('--unpair')) {
    if (pairing) {
      try { await api(pairing.relay, 'POST', '/v1/unpair', { pairId: pairing.pairId }, pairing.secret); } catch { /* relay forgets anyway */ }
      try { fs.unlinkSync(pairFile); } catch { /* already gone */ }
      console.log('Unpaired. This PC will not send anything to your phone any more.');
    } else {
      console.log('This PC was not paired.');
    }
    return;
  }

  if (pairing && wanted && wanted.replace(/\/$/, '') !== pairing.relay) pairing = null; // new relay, new pairing
  const relay = (wanted || (pairing && pairing.relay) || DEFAULT_RELAY).replace(/\/$/, '');

  if (!pairing) {
    console.log('Setting up a pairing with ' + relay + ' ...');
    let r;
    try { r = await api(relay, 'POST', '/v1/pair'); }
    catch (e) { console.log('I could not reach the relay (' + e.message + '). Check your internet and try again.'); process.exit(1); }
    if (r.status !== 200) { console.log('The relay said no (' + r.status + '). Try again in a minute.'); process.exit(1); }
    pairing = { relay, pairId: r.json.pairId, secret: r.json.secret };
    savePairing(pairing);
    showPairing({ ...pairing, code: r.json.code });
  } else {
    console.log('Already paired with your phone. Run with --unpair to start over.');
  }

  console.log('Watching what you copy. Only links and wallet addresses go to your phone.');
  console.log('Everything else you copy, like passwords or normal text, is ignored. Ctrl+C to stop.\n');

  let last = null; // first clipboard reading is skipped, so old content is not sent
  let first = true;
  startClipboardWatcher(async (raw) => {
    const text = raw.trim();
    if (first) { first = false; last = text; return; }
    if (text === last) return;
    last = text;
    const kind = classify(text);
    if (!kind) return;
    if (fs.existsSync(pauseFile)) { console.log('paused, not sent: ' + short(text, kind)); return; }
    try {
      const r = await api(pairing.relay, 'POST', '/v1/send', { pairId: pairing.pairId, kind, text }, pairing.secret);
      if (r.status === 200) console.log('sent to your phone: ' + short(text, kind));
      else if (r.status === 401) console.log('Your phone is no longer paired. Run with --unpair, then start again.');
      else if (r.status === 429) console.log('Too many copies in a minute, skipped: ' + short(text, kind));
      else console.log('could not send (' + r.status + '): ' + short(text, kind));
    } catch (e) {
      console.log('could not reach the relay, skipped: ' + short(text, kind));
    }
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('Something went wrong: ' + e.message); process.exit(1); });
}

module.exports = { classify };
