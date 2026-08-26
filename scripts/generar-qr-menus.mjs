// Genera un QR (PNG) por cada tienda activa+aprobada apuntando a su menú digital
// público (https://mercadito.cx/m/<menu_slug||id>) y una lista en .md y .csv.
// Salida: carpeta qr-menus/ en la raíz del repo.
//
// Uso: DATABASE_URL=... node scripts/generar-qr-menus.mjs
import QR from "qrcode";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const BASE = "https://mercadito.cx";
const DIR = resolve("qr-menus");
const sinPass = process.env.DATABASE_URL.replace(/(\/\/[^:/@]+):(\[YOUR-PASSWORD\]|)@/, "$1@");
const pool = new pg.Pool({ connectionString: sinPass, ssl: { rejectUnauthorized: false } });

const sani = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "tienda";

mkdirSync(DIR, { recursive: true });
const { rows } = await pool.query(
  "SELECT id, nombre, menu_slug FROM puestos WHERE activo = true AND aprobado = true ORDER BY nombre"
);

const used = new Set();
const lista = [];
for (const r of rows) {
  const ref = r.menu_slug || r.id;
  const url = `${BASE}/m/${ref}`;
  let base = sani(r.nombre), name = base, i = 2;
  while (used.has(name)) name = `${base}-${i++}`;
  used.add(name);
  await QR.toFile(join(DIR, `${name}.png`), url, { width: 1000, margin: 2, errorCorrectionLevel: "M" });
  lista.push({ nombre: r.nombre.trim(), url, archivo: `${name}.png` });
}

let md = `# Menús digitales — tiendas Mercadito\n\nTotal: ${lista.length} tiendas activas. Base: ${BASE}/m/\n\n| Tienda | Link del menú | Archivo QR |\n|---|---|---|\n`;
for (const x of lista) md += `| ${x.nombre} | ${x.url} | \`${x.archivo}\` |\n`;
writeFileSync(join(DIR, "_lista.md"), md);

const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
let csv = "tienda,link,qr_archivo\n";
for (const x of lista) csv += `${esc(x.nombre)},${x.url},${x.archivo}\n`;
writeFileSync(join(DIR, "_lista.csv"), csv);

console.log(`Generados ${lista.length} QR en ${DIR}`);
console.log("Listas: qr-menus/_lista.md y qr-menus/_lista.csv");
await pool.end();
