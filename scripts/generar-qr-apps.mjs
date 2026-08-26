// Genera QR (PNG) para descargar la app Mercadito.cx.
//  - mercadito-android.png  -> Google Play
//  - mercadito-ios.png      -> App Store
//  - mercadito-app.png      -> link "inteligente" https://mercadito.cx/app
//      (redirige solo segun el sistema; requiere la ruta /app en la web)
// Salida: carpeta qr-apps/ en la raiz del repo.
//
// Uso: node scripts/generar-qr-apps.mjs
import QR from "qrcode";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve("qr-apps");
const ANDROID = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const IOS = "https://apps.apple.com/mx/app/mercadito-cx/id6771926373";
const SMART = "https://mercadito.cx/app";

mkdirSync(DIR, { recursive: true });

const targets = [
  { archivo: "mercadito-android.png", url: ANDROID, etiqueta: "Google Play (Android)" },
  { archivo: "mercadito-ios.png", url: IOS, etiqueta: "App Store (iOS)" },
  { archivo: "mercadito-app.png", url: SMART, etiqueta: "Link inteligente (detecta el sistema)" },
];

for (const t of targets) {
  await QR.toFile(join(DIR, t.archivo), t.url, { width: 1000, margin: 2, errorCorrectionLevel: "M" });
}

let md = `# QR de descarga — app Mercadito.cx\n\n| Destino | Link | Archivo QR |\n|---|---|---|\n`;
for (const t of targets) md += `| ${t.etiqueta} | ${t.url} | \`${t.archivo}\` |\n`;
writeFileSync(join(DIR, "_lista.md"), md);

console.log(`Generados ${targets.length} QR en ${DIR}`);
console.log("Nota: mercadito-app.png solo funciona si existe la ruta /app en la web.");
