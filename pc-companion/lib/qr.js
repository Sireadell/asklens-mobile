'use strict';
// Draws the pairing QR as an SVG, using the QR maker already installed with
// qrcode-terminal, so nothing new is needed.
function toSvg(text) {
  const QRCode = require('qrcode-terminal/vendor/QRCode');
  const level = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
  const qr = new QRCode(-1, level.L);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
  const s = n + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
module.exports = { toSvg };
