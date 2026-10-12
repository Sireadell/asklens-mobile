'use strict';
// The pairing window: a small page served only on this PC (127.0.0.1) and
// opened in your normal browser. It shows the pairing code and QR, and lets
// you pair a new phone or unpair. Nothing here is reachable from the network.
const http = require('http');
const fs = require('fs');
const { execFile } = require('child_process');
const { toSvg } = require('./qr');

const PAGE = `<!doctype html><meta charset="utf-8"><title>AskLens PC companion</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Segoe UI,system-ui,sans-serif;background:#0b0f14;color:#e8edf2;margin:0;display:grid;place-items:center;min-height:100vh}
main{width:min(380px,92vw);text-align:center}
h1{font-size:20px;margin:0 0 4px}p{color:#9aa7b4;line-height:1.45;margin:8px 0}
.code{font-size:34px;letter-spacing:.3em;font-weight:700;margin:14px 0;color:#4ade80}
img{width:230px;height:230px;border-radius:10px;background:#fff}
button{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:15px;margin:6px 4px;cursor:pointer}
button.alt{background:#27323d}.ok{font-size:44px}
</style>
<main id="m"><p>Loading...</p></main>
<script>
const H={'x-ui':'1'};
async function post(p){await fetch(p,{method:'POST',headers:H});load();}
async function load(){
  let s;try{s=await (await fetch('/state',{headers:H})).json();}catch{return;}
  const m=document.getElementById('m');
  if(s.code&&s.secondsLeft>0){
    m.innerHTML='<h1>Pair your phone</h1><p>Open AskLens Guard, go to <b>Copy on PC</b>, then scan the square or type the code.</p>'
    +'<img src="/qr.svg?'+s.codeAt+'" alt="pairing QR"><div class="code">'+s.code+'</div>'
    +'<p>Works once. Expires in '+Math.floor(s.secondsLeft/60)+':'+String(s.secondsLeft%60).padStart(2,'0')+'.</p>'
    +'<button class="alt" onclick="post(\\'/repair\\')">New code</button>';
  }else if(s.paired){
    m.innerHTML='<div class="ok">&#10003;</div><h1>Paired with your phone</h1><p>Links and wallet addresses you copy are sent to AskLens Guard. Nothing else leaves this PC.</p>'
    +'<button onclick="post(\\'/repair\\')">Pair a new phone</button><button class="alt" onclick="post(\\'/unpair\\')">Unpair</button>';
  }else{
    m.innerHTML='<h1>Not paired</h1><p>This PC is not linked to a phone yet.</p><button onclick="post(\\'/repair\\')">Show pairing code</button>';
  }
}
load();setInterval(load,2000);
</script>`;

function start({ state, newPairing, pairFile }) {
  let port = 0;
  const server = http.createServer(async (req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    // Only this PC's own browser may talk to it.
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return send(403, 'text/plain', 'no');
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/') return send(200, 'text/html; charset=utf-8', PAGE);
    if (req.headers['x-ui'] !== '1' && url !== '/qr.svg') return send(403, 'text/plain', 'no');
    if (req.method === 'GET' && url === '/state') {
      const left = state.code ? Math.max(0, Math.round((state.codeAt + 10 * 60 * 1000 - Date.now()) / 1000)) : 0;
      return send(200, 'application/json', JSON.stringify({ paired: Boolean(state.pairing), code: state.code, codeAt: state.codeAt, secondsLeft: left }));
    }
    if (req.method === 'GET' && url === '/qr.svg' && state.pairing && state.code) {
      return send(200, 'image/svg+xml', toSvg(JSON.stringify({ relay: state.pairing.relay, pairId: state.pairing.pairId, secret: state.pairing.secret, code: state.code })));
    }
    if (req.method === 'POST' && url === '/repair') {
      try { await newPairing(); } catch (e) { return send(502, 'application/json', JSON.stringify({ error: e.message })); }
      return send(200, 'application/json', '{}');
    }
    if (req.method === 'POST' && url === '/unpair') {
      const p = state.pairing;
      if (p) {
        try { await fetch(p.relay + '/v1/unpair', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pair-secret': p.secret }, body: JSON.stringify({ pairId: p.pairId }), signal: AbortSignal.timeout(15000) }); } catch { /* relay forgets anyway */ }
        try { fs.unlinkSync(pairFile); } catch { /* already gone */ }
        state.pairing = null; state.code = null;
      }
      return send(200, 'application/json', '{}');
    }
    return send(404, 'text/plain', 'not found');
  });
  server.listen(0, '127.0.0.1', () => { port = server.address().port; });
  server.unref();
  return {
    open() {
      const go = () => execFile('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${port}/`], { windowsHide: true }, () => {});
      if (port) go(); else server.once('listening', go);
    },
    port: () => port,
  };
}

module.exports = { start };
