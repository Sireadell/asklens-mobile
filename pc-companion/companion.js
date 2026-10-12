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

const { classify, createDedupe } = require('./lib/detect');
const { checkLink, createAddressWatch, loadBlocklist } = require('./lib/precheck');
const login = require('./lib/login');
const blocklistFile = path.join(dir, 'blocklist.txt');
const trayFile = path.join(dir, 'tray-in.txt');

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
      '  node companion.js --tray       run quietly with a tray icon and a pairing window',
      '  node companion.js --repair     pair a new phone with a fresh code',
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
  const tray = flag('--tray');

  // The newest pairing code, kept in memory only. The relay forgets it after 10 minutes.
  const state = { pairing, code: null, codeAt: 0, relay };
  async function newPairing() {
    const r = await api(state.relay, 'POST', '/v1/pair');
    if (r.status !== 200) throw new Error('The relay said no (' + r.status + '). Try again in a minute.');
    state.pairing = { relay: state.relay, pairId: r.json.pairId, secret: r.json.secret };
    state.code = r.json.code;
    state.codeAt = Date.now();
    savePairing(state.pairing);
  }

  if (!state.pairing) {
    console.log('Setting up a pairing with ' + relay + ' ...');
    try { await newPairing(); }
    catch (e) { console.log('I could not set up pairing (' + e.message + '). Check your internet and try again.'); process.exit(1); }
    if (!tray) showPairing({ ...state.pairing, code: state.code });
  } else if (!tray) {
    console.log('Already paired with your phone. Run with --unpair to start over, or --repair to pair a new phone.');
  }
  if (flag('--repair') && !tray) {
    try { await newPairing(); showPairing({ ...state.pairing, code: state.code }); }
    catch (e) { console.log('Could not make a new code: ' + e.message); process.exit(1); }
  }

  const notifyTray = (title, body) => {
    if (!tray) return;
    try { fs.appendFileSync(trayFile, 'notify\t' + title + '\t' + body.replace(/\s+/g, ' ') + '\n'); } catch { /* tray will miss one balloon */ }
  };
  const say = (line) => console.log(line);
  const isPaused = () => fs.existsSync(pauseFile);

  // Everything copied goes through here.
  const dedupe = createDedupe();
  const addresses = createAddressWatch();
  async function handleCopy(found) {
    const { kind, text } = found;
    const key = kind + ':' + (kind === 'evm-address' ? text.toLowerCase() : text);
    if (dedupe.isRepeat(key)) return;
    if (!state.pairing) return;
    if (isPaused()) { say('paused, not sent: ' + short(text, kind)); return; }
    let warning = null;
    if (kind === 'link') {
      const bad = checkLink(text, loadBlocklist(blocklistFile));
      if (bad) {
        say('BLOCKED on this PC, not sent: ' + short(text, kind) + ' (' + bad.why + ')');
        notifyTray('Link blocked', short(text, kind) + ': ' + bad.why + '. Not sent to your phone.');
        return;
      }
    } else {
      warning = addresses.check(text);
      if (warning) {
        say('WARNING: ' + short(text, kind) + ' ' + warning.why);
        notifyTray('Careful with this address', 'It ' + warning.why + '. Check every character.');
      }
    }
    try {
      const r = await api(state.pairing.relay, 'POST', '/v1/send', { pairId: state.pairing.pairId, kind, text }, state.pairing.secret);
      if (r.status === 200) say('sent to your phone: ' + short(text, kind));
      else if (r.status === 401) { say('Your phone is no longer paired. Run with --unpair, then start again.'); notifyTray('Phone not paired', 'Open the pairing window to pair again.'); }
      else if (r.status === 429) say('Too many copies in a minute, skipped: ' + short(text, kind));
      else say('could not send (' + r.status + '): ' + short(text, kind));
    } catch (e) {
      say('could not reach the relay, skipped: ' + short(text, kind));
    }
  }

  if (tray) {
    const win = require('./lib/window').start({ state, newPairing, readPairing, savePairing, api, pairFile, flagOpen: true });
    const { spawn: sp } = require('child_process');
    try { fs.unlinkSync(trayFile); } catch { /* none */ }
    const ps = sp('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-STA', '-File',
      path.join(__dirname, 'tray.ps1'), '-InFile', trayFile, '-Paused', isPaused() ? '1' : '0', '-Login', login.isEnabled() ? '1' : '0'],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let buf = '';
    ps.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const cmd = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (cmd === 'open') win.open();
        else if (cmd === 'pause') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(pauseFile, '1'); }
        else if (cmd === 'resume') { try { fs.unlinkSync(pauseFile); } catch { /* ok */ } }
        else if (cmd === 'login-on') { try { login.enable(dir, __filename); notifyTray('Start at sign in is on', 'The companion will start by itself when you sign in.'); } catch (e) { notifyTray('Could not set start at sign in', e.message); } }
        else if (cmd === 'login-off') login.disable();
        else if (cmd === 'quit') process.exit(0);
      }
    });
    ps.on('exit', () => process.exit(0));
    process.on('exit', () => ps.kill());
    if (!readPairing() || state.code) win.open(); // first run: show the pairing window straight away
  } else {
    console.log('Watching what you copy. Only links and wallet addresses go to your phone.');
    console.log('Everything else you copy, like passwords or normal text, is ignored. Ctrl+C to stop.\n');
  }

  let last = null; // first clipboard reading is skipped, so old content is not sent
  let first = true;
  startClipboardWatcher(async (raw) => {
    const text = raw.trim();
    if (first) { first = false; last = text; return; }
    if (text === last) return;
    last = text;
    const found = classify(text);
    if (found) await handleCopy(found);
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('Something went wrong: ' + e.message); process.exit(1); });
}

module.exports = { classify };
