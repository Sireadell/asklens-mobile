'use strict';
// "Start when I sign in": a hidden launcher in the companion's data folder and
// one entry in the current user's Windows startup list. Needs no admin rights.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const NAME = 'AskLens PC Companion';

function launcherPath(dir) { return path.join(dir, 'start-hidden.vbs'); }

function enable(dir, scriptPath) {
  fs.mkdirSync(dir, { recursive: true });
  const q = (s) => s.replace(/"/g, '""');
  fs.writeFileSync(launcherPath(dir),
    `CreateObject("WScript.Shell").Run """${q(process.execPath)}"" ""${q(scriptPath)}"" --tray", 0, False\r\n`);
  execFileSync('reg.exe', ['add', KEY, '/v', NAME, '/t', 'REG_SZ', '/d', `wscript.exe //B "${launcherPath(dir)}"`, '/f'], { windowsHide: true, stdio: 'ignore' });
}
function disable() {
  try { execFileSync('reg.exe', ['delete', KEY, '/v', NAME, '/f'], { windowsHide: true, stdio: 'ignore' }); } catch { /* not set */ }
}
function isEnabled() {
  try { execFileSync('reg.exe', ['query', KEY, '/v', NAME], { windowsHide: true, stdio: 'ignore' }); return true; } catch { return false; }
}
module.exports = { enable, disable, isEnabled };
