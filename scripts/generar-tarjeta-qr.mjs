// Compone una tarjeta imprimible (A6, 300 DPI) con los QR de descarga de la app
// Mercadito.cx — uno para Android (Play Store) y otro para iPhone (App Store) —
// pensada para repartir con cada entrega.
// Salida: qr-apps/tarjeta-descarga.png (y .svg vectorial).
//
// Uso: node scripts/generar-tarjeta-qr.mjs
import QR from "qrcode";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve("qr-apps");
mkdirSync(DIR, { recursive: true });

const ANDROID = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const IOS = "https://apps.apple.com/mx/app/mercadito-cx/id6771926373";

// Paleta de marca (globals.css)
const BRAND = "#ed8e3c", NAVY = "#92400e", CREAM = "#fff7eb", INK = "#3a2a14";

// A6 vertical @ 300 DPI
const W = 1240, H = 1748;

// QR como SVG vectorial; lo anidamos con posicion/tamano propios.
async function qrSvg(url, x, y, size) {
  const svg = await QR.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const inner = svg.replace(/^<\?xml.*?\?>\s*/s, "");
  return inner.replace(
    /^<svg /,
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" `
  );
}

// Logo embebido como data URI
const logoB64 = readFileSync("public/logo.png").toString("base64");

const qrSize = 440;
const gap = 70;
const qrY = 760;
const xA = (W - qrSize * 2 - gap) / 2;
const xB = xA + qrSize + gap;

const qA = await qrSvg(ANDROID, xA, qrY, qrSize);
const qB = await qrSvg(IOS, xB, qrY, qrSize);

const cx = W / 2;
const cardR = 28, pad = 22;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${CREAM}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="40" fill="none" stroke="${BRAND}" stroke-width="6"/>

  <!-- Logo -->
  <image href="data:image/png;base64,${logoB64}" x="${cx - 200}" y="120" width="400" height="400"/>

  <!-- Titulos -->
  <text x="${cx}" y="595" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="74" font-weight="bold" fill="${NAVY}">Descarga la app</text>
  <text x="${cx}" y="675" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="46" fill="${INK}">Escanea con tu celular</text>

  <!-- Tarjetas blancas detras de cada QR -->
  <rect x="${xA - pad}" y="${qrY - pad}" width="${qrSize + pad * 2}" height="${qrSize + pad * 2}" rx="${cardR}" fill="#ffffff" stroke="#eadbc4" stroke-width="3"/>
  <rect x="${xB - pad}" y="${qrY - pad}" width="${qrSize + pad * 2}" height="${qrSize + pad * 2}" rx="${cardR}" fill="#ffffff" stroke="#eadbc4" stroke-width="3"/>
  ${qA}
  ${qB}

  <!-- Etiquetas de tienda -->
  <text x="${xA + qrSize / 2}" y="${qrY + qrSize + 90}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="50" font-weight="bold" fill="${NAVY}">Android</text>
  <text x="${xA + qrSize / 2}" y="${qrY + qrSize + 140}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${INK}">Google Play</text>
  <text x="${xB + qrSize / 2}" y="${qrY + qrSize + 90}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="50" font-weight="bold" fill="${NAVY}">iPhone</text>
  <text x="${xB + qrSize / 2}" y="${qrY + qrSize + 140}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${INK}">App Store</text>

  <!-- Pie -->
  <rect x="40" y="${H - 170}" width="${W - 80}" height="130" rx="0" fill="none"/>
  <text x="${cx}" y="${H - 95}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="bold" fill="${BRAND}">mercadito.cx</text>
  <text x="${cx}" y="${H - 50}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${INK}">Tu mercado local, a domicilio</text>
</svg>`;

writeFileSync(join(DIR, "tarjeta-descarga.svg"), svg);
await sharp(Buffer.from(svg), { density: 300 }).png().toFile(join(DIR, "tarjeta-descarga.png"));

console.log("Tarjeta generada:");
console.log("  qr-apps/tarjeta-descarga.png  (imprimible, A6 300dpi)");
console.log("  qr-apps/tarjeta-descarga.svg  (vectorial, escalable)");
