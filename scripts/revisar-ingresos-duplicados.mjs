// Revisa TODOS los ingresos manuales y detecta duplicados: filas idénticas
// (mismo repartidor, tipo, tienda/cliente, monto y detalle) capturadas al mismo
// o casi al mismo tiempo — el patrón del bug de doble-tap.
//
// Por defecto SOLO REPORTA (no borra). Muestra cada grupo, el que se conserva
// (el más antiguo) y los duplicados, con la diferencia de tiempo y todo en hora
// de México (Sahuayo). Para borrar los duplicados (conservando el más antiguo
// de cada grupo) corre con --borrar.
//
// Uso:
//   DATABASE_URL=... node scripts/revisar-ingresos-duplicados.mjs
//   DATABASE_URL=... node scripts/revisar-ingresos-duplicados.mjs --ventana=300   (segundos, default 300)
//   DATABASE_URL=... node scripts/revisar-ingresos-duplicados.mjs --borrar
import pg from "pg";

const args = process.argv.slice(2);
const BORRAR = args.includes("--borrar");
const ventanaArg = args.find((a) => a.startsWith("--ventana="));
const VENTANA_SEG = ventanaArg ? Math.max(1, parseInt(ventanaArg.split("=")[1], 10) || 300) : 300;

const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("Falta DATABASE_URL. Ej: DATABASE_URL=postgres://... node scripts/revisar-ingresos-duplicados.mjs");
  process.exit(1);
}
const sinPass = conn.replace(/(\/\/[^:/@]+):(\[YOUR-PASSWORD\]|)@/, "$1@");
const pool = new pg.Pool({ connectionString: sinPass, ssl: { rejectUnauthorized: false } });

const fmtMX = (d) =>
  new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "medium" });

// Cada fila se compara con la ANTERIOR idéntica (misma identidad), ordenada por
// tiempo. Si la diferencia es <= ventana, es duplicado. Para 3+ envíos seguidos,
// cada uno después del primero queda marcado (se conserva solo el primero).
const sql = `
  WITH base AS (
    SELECT
      id, repartidor_id, tipo, puesto_id, cliente_nombre, cliente_telefono,
      monto, metodo_pago, detalle, created_at,
      LAG(id)         OVER w AS prev_id,
      LAG(created_at) OVER w AS prev_at
    FROM ingresos_manuales
    WINDOW w AS (
      PARTITION BY repartidor_id, tipo, COALESCE(puesto_id,''),
                   COALESCE(cliente_nombre,''), monto, COALESCE(detalle,'')
      ORDER BY created_at
    )
  )
  SELECT b.*, u.nombre AS repartidor_nombre, pu.nombre AS puesto_nombre,
         EXTRACT(EPOCH FROM (b.created_at - b.prev_at)) AS delta_seg
  FROM base b
  JOIN usuarios u ON u.id = b.repartidor_id
  LEFT JOIN puestos pu ON pu.id = b.puesto_id
  WHERE b.prev_at IS NOT NULL
    AND b.created_at - b.prev_at <= ($1 || ' seconds')::interval
  ORDER BY b.created_at;
`;

const { rows: total } = await pool.query("SELECT COUNT(*)::int AS n FROM ingresos_manuales");
const { rows: dups } = await pool.query(sql, [String(VENTANA_SEG)]);

console.log(`\nIngresos manuales totales: ${total[0].n}`);
console.log(`Ventana de "casi al mismo tiempo": ${VENTANA_SEG} segundos\n`);

if (dups.length === 0) {
  console.log("✅ No se encontraron duplicados dentro de la ventana. Todo limpio.");
  await pool.end();
  process.exit(0);
}

let sumaMonto = 0;
console.log(`⚠️  ${dups.length} duplicado(s) detectado(s):\n`);
for (const d of dups) {
  sumaMonto += Number(d.monto);
  const quien = d.tipo === "tienda" ? (d.puesto_nombre || d.puesto_id || "tienda") : (d.cliente_nombre || "mandado");
  console.log(`• $${Number(d.monto).toFixed(2)} · ${d.tipo} (${quien}) · ${d.repartidor_nombre} · ${d.metodo_pago}`);
  console.log(`   detalle: ${d.detalle || "—"}`);
  console.log(`   CONSERVAR original: ${d.prev_id}  (${fmtMX(d.prev_at)})`);
  console.log(`   DUPLICADO a borrar: ${d.id}  (${fmtMX(d.created_at)})  +${Math.round(Number(d.delta_seg))}s después`);
  console.log("");
}
console.log(`Total de filas duplicadas: ${dups.length}  ·  Monto sobrante (doble contado): $${sumaMonto.toFixed(2)}\n`);

if (!BORRAR) {
  console.log("Esto fue SOLO revisión. Para borrar los duplicados (conserva el más antiguo de cada grupo):");
  console.log("   DATABASE_URL=... node scripts/revisar-ingresos-duplicados.mjs --borrar\n");
  await pool.end();
  process.exit(0);
}

// Borrado dentro de transacción.
const ids = dups.map((d) => d.id);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const r = await client.query("DELETE FROM ingresos_manuales WHERE id = ANY($1::text[])", [ids]);
  await client.query("COMMIT");
  console.log(`🗑️  Borrados ${r.rowCount} duplicado(s). Originales intactos.`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Error al borrar, se hizo ROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
