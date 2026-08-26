#!/usr/bin/env node
// Borra TODO el movimiento de dinero de Mercadito y deja el sistema como
// recién instalado, conservando lo que no es transaccional.
//
// SE VA:      pedidos y sus items (delivery y mesa), cuentas, cortes de caja y
//             sus movimientos, ventas de menú, ingresos manuales, movimientos
//             de repartidor y reservas (citas).
// SE QUEDA:   negocios, menús, productos, precios, promociones, mesas y sus
//             QR, meseros, usuarios, mensajes y chats.
//
// Uso:
//   DATABASE_URL=... node scripts/resetear-metricas.mjs --dry   # cuenta, no borra
//   DATABASE_URL=... node scripts/resetear-metricas.mjs         # borra de verdad
//
// NO SE PUEDE DESHACER. El único respaldo es el diario de Supabase. Corre
// siempre --dry primero y revisa que los conteos cuadren con lo que esperas.
import pg from "pg";
import readline from "node:readline/promises";

const DRY = process.argv.includes("--dry");

// Orden importante: hijos antes que padres, o las llaves foráneas lo rechazan.
//   pedido_items → pedidos → caja_movimientos → cuentas → caja_turnos → resto
const TABLAS = [
  "pedido_items",
  "pedidos",
  "caja_movimientos",
  "cuentas",
  "caja_turnos",
  "menu_ventas",
  "ingresos_manuales",
  "repartidor_movimientos",
  "citas",
];

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false },
});

async function contar() {
  const filas = [];
  for (const t of TABLAS) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      filas.push([t, r.rows[0].n]);
    } catch {
      filas.push([t, null]); // la tabla no existe en esta base
    }
  }
  return filas;
}

const conteos = await contar();
const total = conteos.reduce((s, [, n]) => s + (n ?? 0), 0);

console.log("");
for (const [t, n] of conteos) {
  console.log(`  ${t.padEnd(24)} ${n === null ? "(no existe)" : String(n).padStart(7)}`);
}
console.log(`  ${"TOTAL".padEnd(24)} ${String(total).padStart(7)} filas\n`);

if (DRY) {
  console.log("--dry: no se borró nada.\n");
  await pool.end();
  process.exit(0);
}

if (total === 0) {
  console.log("No hay nada que borrar.\n");
  await pool.end();
  process.exit(0);
}

// Confirmación escrita: un reset de esto no se deshace, y el historial de la
// terminal hace demasiado fácil repetir el comando sin querer.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const resp = await rl.question(`Se van a borrar ${total} filas SIN VUELTA ATRÁS. Escribe BORRAR para continuar: `);
rl.close();
if (resp.trim() !== "BORRAR") {
  console.log("Cancelado.\n");
  await pool.end();
  process.exit(0);
}

const cliente = await pool.connect();
try {
  // Todo o nada: si una tabla falla, no queremos quedarnos con las métricas a
  // medio borrar y sin forma de saber cuáles.
  await cliente.query("BEGIN");
  for (const [t, n] of conteos) {
    if (n === null) continue;
    const r = await cliente.query(`DELETE FROM ${t}`);
    console.log(`  ${t.padEnd(24)} ${String(r.rowCount).padStart(7)} borradas`);
  }
  // Los folios de ticket vuelven a empezar en 1: si no, el primer ticket real
  // saldría con el número que dejaron las pruebas.
  await cliente.query("UPDATE puestos SET folio_actual = 0");
  await cliente.query("COMMIT");
  console.log("\nListo. Métricas en cero.\n");
} catch (e) {
  await cliente.query("ROLLBACK");
  console.error("\nFalló, no se borró nada:", e.message, "\n");
  process.exitCode = 1;
} finally {
  cliente.release();
  await pool.end();
}
