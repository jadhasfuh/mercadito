#!/usr/bin/env node
// Migra imágenes de /public/<...> a base64 dentro de la BD.
// Genera /tmp/migrar-imagenes.sql con UPDATEs para productos.imagen y
// puestos.logo. Después ese SQL se ejecuta contra prod (BEGIN/COMMIT).
//
// Uso:
//   node scripts/migrar-imagenes-a-base64.mjs
//   scp /tmp/migrar-imagenes.sql root@157.173.199.130:/tmp/
//   ssh root@... "docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito -v ON_ERROR_STOP=1 < /tmp/migrar-imagenes.sql"

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = "/home/adrian/Documents/mercadito/public";
const SSH_TARGET = "root@157.173.199.130";
const SQL_OUT = "/tmp/migrar-imagenes.sql";

function ssh(sql) {
  // psql -At = unaligned, no headers
  const cmd = `ssh ${SSH_TARGET} "docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito -At" `;
  return execSync(cmd, { input: sql }).toString();
}

function mimeFromExt(ext) {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "png") return "image/png";
  if (e === "svg") return "image/svg+xml";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg"; // jpg/jpeg/default
}

function toDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const mime = mimeFromExt(path.extname(filePath));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function escapeSqlIdent(s) {
  return s.replace(/'/g, "''");
}

function pickDollarTag(content) {
  // Tag único que NO aparezca en el contenido. base64 nunca contiene "$".
  // pero por si acaso: probamos $img$ primero, luego sufijos.
  const candidates = ["img", "img1", "img2", "imgX"];
  for (const t of candidates) {
    const tag = `$${t}$`;
    if (!content.includes(tag)) return t;
  }
  throw new Error("No safe dollar tag found");
}

const updates = [];
const missing = [];

// 1. Productos
{
  const out = ssh("SELECT id || '|' || imagen FROM productos WHERE imagen LIKE '/%';");
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [id, imgPath] = line.split("|");
    const filePath = path.join(PUBLIC_DIR, imgPath);
    if (!fs.existsSync(filePath)) {
      missing.push({ table: "productos", id, imgPath, filePath });
      continue;
    }
    updates.push({ table: "productos", column: "imagen", id, dataUrl: toDataUrl(filePath), source: imgPath });
  }
}

// 2. Puestos
{
  const out = ssh("SELECT id || '|' || logo FROM puestos WHERE logo LIKE '/%';");
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [id, imgPath] = line.split("|");
    const filePath = path.join(PUBLIC_DIR, imgPath);
    if (!fs.existsSync(filePath)) {
      missing.push({ table: "puestos", id, imgPath, filePath });
      continue;
    }
    updates.push({ table: "puestos", column: "logo", id, dataUrl: toDataUrl(filePath), source: imgPath });
  }
}

console.log(`Updates: ${updates.length}`);
console.log(`Missing files: ${missing.length}`);
for (const m of missing) console.warn(`  MISSING ${m.table}#${m.id}: ${m.filePath}`);

let sql = "BEGIN;\n";
let totalBytes = 0;
for (const u of updates) {
  const tag = pickDollarTag(u.dataUrl);
  sql += `UPDATE ${u.table} SET ${u.column} = $${tag}$${u.dataUrl}$${tag}$ WHERE id = '${escapeSqlIdent(u.id)}';\n`;
  totalBytes += u.dataUrl.length;
}
sql += "\n-- Validación post-COMMIT (debería retornar 0 filas en ambas):\n";
sql += "SELECT 'PRODUCTOS RESTANTES CON PATH:' AS check, COUNT(*) AS n FROM productos WHERE imagen LIKE '/%';\n";
sql += "SELECT 'PUESTOS RESTANTES CON PATH:' AS check, COUNT(*) AS n FROM puestos WHERE logo LIKE '/%';\n";
sql += "COMMIT;\n";

fs.writeFileSync(SQL_OUT, sql);
console.log(`Wrote ${SQL_OUT} (${(sql.length / 1024).toFixed(1)} KB total, ${(totalBytes / 1024 / 1024).toFixed(2)} MB de data URLs)`);
