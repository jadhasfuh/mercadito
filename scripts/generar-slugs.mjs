#!/usr/bin/env node
// Asigna menu_slug legible (basado en el nombre) a los puestos cuyo id es feo
// (puesto-xxxx) y que no tienen slug. La página /m/<slug> resuelve por
// (id = $1 OR menu_slug = $1), así que el slug NO debe chocar con ningún id ni
// con otro slug existente. Idempotente: no pisa slugs ya puestos.
//
// Uso: DATABASE_URL=... node scripts/generar-slugs.mjs [--dry]
import pg from "pg";

const DRY = process.argv.includes("--dry");
const sinPass = process.env.DATABASE_URL.replace(/(\/\/[^:/@]+):(\[YOUR-PASSWORD\]|)@/, "$1@");
const pool = new pg.Pool({ connectionString: sinPass, ssl: { rejectUnauthorized: false } });

function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "");
}

const todos = (await pool.query("SELECT id, nombre, menu_slug, activo, aprobado FROM puestos")).rows;
// Reservados: todos los ids + todos los slugs ya existentes (no se pueden reusar).
const reservados = new Set();
for (const p of todos) { reservados.add(p.id); if (p.menu_slug) reservados.add(p.menu_slug); }

const cambios = [];
for (const p of todos) {
  if (!p.activo || !p.aprobado) continue;        // solo activos/aprobados
  if (p.menu_slug) continue;                       // ya tiene slug
  if (!p.id.startsWith("puesto-")) continue;       // id ya legible (amazonico, dominos…) → no hace falta
  let base = slugify(p.nombre) || "tienda";
  let slug = base, n = 2;
  while (reservados.has(slug)) slug = `${base}-${n++}`;
  reservados.add(slug);
  cambios.push({ id: p.id, nombre: p.nombre.trim(), slug });
}

console.log(`Puestos activos: ${todos.filter((p) => p.activo && p.aprobado).length}`);
console.log(`Slugs a asignar: ${cambios.length}\n`);
for (const c of cambios) console.log(`  ${c.slug}   <-  ${c.nombre}  (${c.id})`);

if (DRY) { console.log("\n— DRY: no se escribió nada."); await pool.end(); process.exit(0); }

let ok = 0;
for (const c of cambios) {
  await pool.query("UPDATE puestos SET menu_slug = $1 WHERE id = $2 AND menu_slug IS NULL", [c.slug, c.id]);
  ok++;
}
console.log(`\n✅ ${ok} slugs asignados.`);
await pool.end();
