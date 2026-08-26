// Tarjeta 9x5 cm (300 DPI) — inserto "gracias por tu pedido" para cada entrega.
// Barra naranja arriba (sin marco), logo limpio, 2 QR reales (Android/iPhone),
// CTA y WhatsApp. Diseno espaciado.
// Salida: qr-apps/tarjeta-9x5.png (+ .svg vectorial).
//
// Uso: node scripts/generar-tarjeta-qr-9x5.mjs
import QR from "qrcode";
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve("qr-apps");
mkdirSync(DIR, { recursive: true });

const ANDROID = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const IOS = "https://apps.apple.com/app/id6771926373"; // forma corta -> QR menos denso
const WHATSAPP = "353 127 8217";

// Paleta
const ORANGE = "#F3882A", BLUE = "#1A4A76", DARK = "#333333", GRAY = "#666666", WA = "#25D366";

// 90 x 50 mm @ 300 DPI
const W = 1063, H = 591;

// Icono de la tienda sin el fondo crema (recorta mitad superior del icon-512)
async function iconoMarca() {
  const top = await sharp("public/icon-512.png").extract({ left: 0, top: 0, width: 512, height: 300 }).toBuffer();
  const recorte = await sharp(top).trim({ threshold: 12 }).toBuffer();
  const { data, info } = await sharp(recorte).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 232 && g > 228 && b > 222 && Math.max(r, g, b) - Math.min(r, g, b) < 22) data[i + 3] = 0;
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { b64: png.toString("base64"), ratio: info.width / info.height };
}

async function qrSvg(url, x, y, size) {
  const svg = await QR.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return svg.replace(/^<\?xml.*?\?>\s*/s, "")
            .replace(/^<svg /, `<svg x="${x}" y="${y}" width="${size}" height="${size}" `);
}

const { b64: markB64, ratio } = await iconoMarca();
const markH = 58, markW = Math.round(markH * ratio);

// QR a la derecha, centrados con aire
const qr = 192, gap = 46, chip = 16;
const rightL = 548, rightR = W - 40;
const block = qr * 2 + gap;
const xA = rightL + (rightR - rightL - block) / 2;
const xB = xA + qr + gap;
const qrY = 138;
const cAx = xA + qr / 2, cBx = xB + qr / 2;
const qA = await qrSvg(ANDROID, xA, qrY, qr);
const qB = await qrSvg(IOS, xB, qrY, qr);
const chipRect = (x) => `<rect x="${x - chip}" y="${qrY - chip}" width="${qr + chip * 2}" height="${qr + chip * 2}" rx="18" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>`;
const labelY = qrY + qr + chip + 44;

const lx = 72;
const F = "Helvetica, Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="26"/></clipPath></defs>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="${W}" height="22" fill="${ORANGE}"/>
  </g>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="26" fill="none" stroke="#ececec" stroke-width="2"/>

  <!-- Marca -->
  <image href="data:image/png;base64,${markB64}" x="${lx}" y="66" width="${markW}" height="${markH}"/>
  <text x="${lx + markW + 18}" y="112" font-family="${F}" font-weight="bold" font-size="36" fill="${BLUE}">mercadito</text>

  <!-- Headline -->
  <text x="${lx}" y="212" font-family="${F}" font-weight="bold" font-size="40" fill="${DARK}">¡Gracias por tu pedido!</text>

  <!-- Marca / tagline -->
  <text x="${lx}" y="292" font-family="${F}" font-weight="bold" font-size="38" fill="${ORANGE}">mercadito.cx</text>
  <text x="${lx}" y="328" font-family="${F}" font-size="21" fill="${GRAY}">Tu mercado local, a domicilio</text>

  <!-- CTA -->
  <text x="${lx}" y="408" font-family="${F}" font-weight="bold" font-size="28" fill="${DARK}">Descarga la app</text>
  <text x="${lx}" y="440" font-family="${F}" font-size="20" fill="${GRAY}">Escanea con tu celular</text>

  <!-- WhatsApp -->
  <g transform="translate(${lx}, ${H - 78})">
    <path transform="scale(1.45)" fill="${WA}" d="M12 0C5.373 0 0 5.373 0 12c0 2.12.553 4.11 1.536 5.86L0 24l6.302-1.503C8.01 23.447 9.95 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.606 17.135c-.282.795-1.63 1.48-2.26 1.56-.55.07-1.33.15-4.21-1.04-3.69-1.53-6.07-5.32-6.26-5.57-.18-.25-1.49-1.99-1.49-3.79 0-1.81.94-2.71 1.28-3.08.33-.36.72-.45.96-.45.24 0 .48 0 .69.01.22.01.52-.08.81.62.3.71.95 2.34 1.04 2.52.09.18.15.39.03.62-.12.24-.18.39-.36.6-.18.21-.38.45-.53.6-.18.18-.38.38-.17.74.21.36.94 1.55 2.01 2.5 1.38 1.23 2.56 1.61 2.92 1.79.36.18.57.15.79-.1.21-.25.92-1.07 1.17-1.44.24-.36.48-.3.81-.18.33.12 2.08.98 2.44 1.16.36.18.6.27.69.42.09.15.09.87-.19 1.66z"/>
  </g>
  <text x="${lx + 58}" y="${H - 50}" font-family="${F}" font-weight="bold" font-size="30" fill="${DARK}">${WHATSAPP}</text>

  <!-- QR -->
  ${chipRect(xA)} ${chipRect(xB)}
  ${qA} ${qB}
  <text x="${cAx}" y="${labelY}" text-anchor="middle" font-family="${F}" font-weight="bold" font-size="26" fill="${ORANGE}">Android</text>
  <text x="${cBx}" y="${labelY}" text-anchor="middle" font-family="${F}" font-weight="bold" font-size="26" fill="${ORANGE}">iPhone</text>
</svg>`;

writeFileSync(join(DIR, "tarjeta-9x5.svg"), svg);
await sharp(Buffer.from(svg), { density: 300 }).png().toFile(join(DIR, "tarjeta-9x5.png"));

console.log("Tarjeta 9x5 cm generada:");
console.log("  qr-apps/tarjeta-9x5.png  (90x50mm @300dpi)");
console.log("  qr-apps/tarjeta-9x5.svg  (vectorial)");
