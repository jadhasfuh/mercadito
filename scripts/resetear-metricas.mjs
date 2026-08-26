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
// ANTES DE BORRAR guarda un respaldo completo en JSON (todas las filas, más un
// resumen legible). Los $17,883 de mayo–julio y los pedidos entregados son la
// única copia que queda de la operación con delivery: si se borran sin
// respaldo, no hay de dónde sacarlos después.
//
// Uso:
//   node scripts/resetear-metricas.mjs --dry            solo cuenta, no toca nada
//   node scripts/resetear-metricas.mjs --solo-respaldo   guarda el JSON y se sale
//   node scripts/resetear-metricas.mjs                   respalda, pregunta y borra
//
// La conexión sale sola de CONTEXTO-PRIVADO.md (o de DATABASE_URL si la pones).
// NO SE PUEDE DESHACER. Corre siempre --dry primero.
import pg from "pg";
import readline from "node:readline/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DRY = process.argv.includes("--dry");
const SOLO_RESPALDO = process.argv.includes("--solo-respaldo");
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

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

/**
 * De dónde sale la conexión, en orden:
 *   1. DATABASE_URL, si la exportaste.
 *   2. CONTEXTO-PRIVADO.md (gitignored), que ya tiene la cadena y el password.
 *
 * Así el comando de uso diario es solo `node scripts/resetear-metricas.mjs`,
 * sin pegar credenciales en la terminal — que además quedan en el historial
 * del shell y en cualquier captura de pantalla.
 */
function resolverConexion() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, origen: "DATABASE_URL" };

  let txt;
  try {
    txt = readFileSync(join(RAIZ, "CONTEXTO-PRIVADO.md"), "utf8");
  } catch {
    return null;
  }
  // La cadena viene con un placeholder de password y a veces con basura
  // pegada al final de la línea; nos quedamos solo con lo que es URL válida.
  const cadena = txt.match(/postgresql:\/\/[^\s"'`]+/);
  if (!cadena) return null;
  let url = cadena[0].replace(/[^\w\-./:@?=&%+]+$/, "");

  const pass = txt.match(/^DBPass:\s*(\S+)/m)?.[1];
  if (url.includes("[YOUR-PASSWORD]")) {
    if (!pass) return null;
    url = url.replace("[YOUR-PASSWORD]", encodeURIComponent(pass));
  }
  return { url, origen: "CONTEXTO-PRIVADO.md" };
}

const conexion = resolverConexion();
if (!conexion) {
  console.error(
    "\nNo encontré la conexión a la base.\n" +
    "  · Deja CONTEXTO-PRIVADO.md en la raíz del repo (con su línea DBPass), o\n" +
    "  · exporta DATABASE_URL antes de correr el script.\n"
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: conexion.url,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(conexion.url) ? undefined : { rejectUnauthorized: false },
});

const filasDe = async (sql) => (await pool.query(sql)).rows;

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

/** Números que valdría la pena poder consultar dentro de un año. */
async function resumen() {
  const uno = async (sql) => (await filasDe(sql))[0] ?? {};
  return {
    pedidos: await uno(`
      SELECT COUNT(*)::int total,
             COUNT(*) FILTER (WHERE estado = 'entregado')::int entregados,
             COUNT(*) FILTER (WHERE estado = 'cancelado')::int cancelados,
             COALESCE(SUM(total) FILTER (WHERE estado = 'entregado'), 0)::float ventas,
             COALESCE(SUM(costo_envio) FILTER (WHERE estado = 'entregado'), 0)::float ingresos_envio,
             COUNT(DISTINCT cliente_telefono) FILTER (WHERE estado = 'entregado')::int clientes_unicos,
             MIN(created_at)::date::text desde, MAX(created_at)::date::text hasta
      FROM pedidos`),
    comisiones: await uno(`
      SELECT COALESCE(SUM(pi.cantidad * COALESCE(pi.comision, 2)), 0)::float total
      FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.estado = 'entregado'`),
    ingresos_manuales: await uno(`
      SELECT COUNT(*)::int movimientos, COALESCE(SUM(monto), 0)::float total,
             MIN(created_at)::date::text desde, MAX(created_at)::date::text hasta
      FROM ingresos_manuales`),
    ventas_por_tienda: await filasDe(`
      SELECT p.nombre negocio, COUNT(DISTINCT pi.pedido_id)::int pedidos,
             COALESCE(SUM(pi.subtotal), 0)::float vendido
      FROM pedido_items pi
      JOIN puestos p ON p.id = pi.puesto_id
      GROUP BY p.nombre ORDER BY vendido DESC`),
    ventas_por_dia: await filasDe(`
      SELECT to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') dia,
             COUNT(*)::int pedidos, COALESCE(SUM(total), 0)::float total
      FROM pedidos GROUP BY 1 ORDER BY 1`),
    manuales_por_repartidor: await filasDe(`
      SELECT u.nombre repartidor, COUNT(*)::int movimientos, COALESCE(SUM(im.monto), 0)::float total
      FROM ingresos_manuales im
      LEFT JOIN usuarios u ON u.id = im.repartidor_id
      GROUP BY u.nombre ORDER BY total DESC`),
    citas: await uno("SELECT COUNT(*)::int total, MIN(inicio)::date::text desde, MAX(inicio)::date::text hasta FROM citas"),
  };
}

const conteos = await contar();
const total = conteos.reduce((s, [, n]) => s + (n ?? 0), 0);

console.log(`\nBase: ${conexion.origen}\n`);
for (const [t, n] of conteos) {
  console.log(`  ${t.padEnd(24)} ${n === null ? "(no existe)" : String(n).padStart(7)}`);
}
console.log(`  ${"TOTAL".padEnd(24)} ${String(total).padStart(7)} filas\n`);

if (DRY) {
  console.log("--dry: no se borró nada.\n");
  await pool.end();
  process.exit(0);
}

if (total === 0 && !SOLO_RESPALDO) {
  console.log("No hay nada que borrar.\n");
  await pool.end();
  process.exit(0);
}

// ── Respaldo ──────────────────────────────────────────────────────────────
// Filas crudas además del resumen: con el resumen se consulta, con las filas
// se puede reconstruir. Son pocos cientos de registros, no cuesta nada.
const hoy = new Date().toISOString().slice(0, 10);
const archivo = join(RAIZ, `respaldo-metricas-${hoy}.json`);
const respaldo = { generado: new Date().toISOString(), resumen: await resumen(), filas: {} };
for (const [t, n] of conteos) {
  if (n === null) continue;
  respaldo.filas[t] = await filasDe(`SELECT * FROM ${t}`);
}
writeFileSync(archivo, JSON.stringify(respaldo, null, 2));

const r = respaldo.resumen;
console.log(`Respaldo guardado: ${archivo}`);
console.log(`  ${r.pedidos.entregados} pedidos entregados · $${Math.round(r.pedidos.ventas)} vendidos · $${Math.round(r.pedidos.ingresos_envio)} en envíos`);
console.log(`  $${Math.round(r.ingresos_manuales.total)} en ingresos manuales (${r.ingresos_manuales.movimientos} movimientos)`);
console.log(`  ${r.pedidos.desde ?? "—"} → ${r.pedidos.hasta ?? "—"}`);
console.log("  ⚠️  Trae teléfonos y direcciones de clientes: está gitignored, guárdalo en un lugar seguro.\n");

if (SOLO_RESPALDO) {
  console.log("--solo-respaldo: no se borró nada.\n");
  await pool.end();
  process.exit(0);
}

// Confirmación escrita: un reset de esto no se deshace, y el historial de la
// terminal hace demasiado fácil repetir el comando sin querer.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const resp = await rl.question(`Se van a borrar ${total} filas SIN VUELTA ATRÁS. Escribe BORRAR para continuar: `);
rl.close();
if (resp.trim() !== "BORRAR") {
  console.log("Cancelado. El respaldo se queda.\n");
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
    const res = await cliente.query(`DELETE FROM ${t}`);
    console.log(`  ${t.padEnd(24)} ${String(res.rowCount).padStart(7)} borradas`);
  }
  // Los folios de ticket vuelven a empezar en 1: si no, el primer ticket real
  // saldría con el número que dejaron las pruebas.
  await cliente.query("UPDATE puestos SET folio_actual = 0");
  await cliente.query("COMMIT");
  console.log(`\nListo. Métricas en cero. El respaldo quedó en ${archivo}\n`);
} catch (e) {
  await cliente.query("ROLLBACK");
  console.error("\nFalló, no se borró nada:", e.message, "\n");
  process.exitCode = 1;
} finally {
  cliente.release();
  await pool.end();
}
