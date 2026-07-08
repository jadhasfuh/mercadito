#!/usr/bin/env node
// Diagnóstico de registro de push. Responde: ¿cuántos usuarios tienen push_token
// y cuántos no, por rol? ¿Es sistémico (0%) o parcial (permisos)? ¿Hay tokens
// con formato raro? ¿Los usuarios ACTIVOS (con pedidos) tienen token?
//
// Solo LEE. No modifica ni envía nada.
//
// Uso:  DATABASE_URL='postgresql://...' node scripts/diagnostico-push.mjs
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✖ Falta DATABASE_URL.");
  process.exit(1);
}
const sinPass = DATABASE_URL.replace(/(\/\/[^:/@]+):(\[YOUR-PASSWORD\]|)@/, "$1@");
const pool = new pg.Pool({ connectionString: sinPass, ssl: { rejectUnauthorized: false } });

function pct(n, d) { return d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`; }

async function main() {
  // 1) Cobertura por rol
  const { rows: porRol } = await pool.query(`
    SELECT rol,
           COUNT(*)                                                        AS total,
           COUNT(*) FILTER (WHERE push_token IS NOT NULL AND push_token <> '') AS con_token,
           COUNT(*) FILTER (WHERE push_token LIKE 'ExponentPushToken%')    AS token_valido
    FROM usuarios
    GROUP BY rol
    ORDER BY rol`);

  console.log("\n═══ Cobertura de push_token por rol ═══");
  console.log("rol".padEnd(14), "total".padStart(7), "con_token".padStart(11), "válido".padStart(9), "cobertura".padStart(11));
  let tTotal = 0, tCon = 0;
  for (const r of porRol) {
    tTotal += Number(r.total); tCon += Number(r.token_valido);
    console.log(
      String(r.rol ?? "—").padEnd(14),
      String(r.total).padStart(7),
      String(r.con_token).padStart(11),
      String(r.token_valido).padStart(9),
      pct(Number(r.token_valido), Number(r.total)).padStart(11)
    );
  }
  console.log("─".repeat(54));
  console.log("TOTAL".padEnd(14), String(tTotal).padStart(7), "", String(tCon).padStart(9), pct(tCon, tTotal).padStart(11));

  // 2) Tokens con formato inválido (no vacíos pero no ExponentPushToken)
  const { rows: raros } = await pool.query(`
    SELECT rol, COUNT(*) AS n
    FROM usuarios
    WHERE push_token IS NOT NULL AND push_token <> '' AND push_token NOT LIKE 'ExponentPushToken%'
    GROUP BY rol`);
  if (raros.length) {
    console.log("\n⚠ Tokens con formato NO ExponentPushToken (probable FCM/APNs crudo mal guardado):");
    for (const r of raros) console.log(`   ${r.rol}: ${r.n}`);
  }

  // 3) Tokens duplicados (mismo device, varios usuarios) — esperable si comparten celular
  const { rows: dup } = await pool.query(`
    SELECT COUNT(*) AS tokens_repetidos FROM (
      SELECT push_token FROM usuarios
      WHERE push_token LIKE 'ExponentPushToken%'
      GROUP BY push_token HAVING COUNT(*) > 1
    ) t`);
  console.log(`\nTokens compartidos por >1 usuario: ${dup[0].tokens_repetidos}`);

  // 4) Cobertura entre usuarios ACTIVOS (clientes con >=1 pedido) — descarta cuentas muertas
  const { rows: act } = await pool.query(`
    SELECT
      COUNT(DISTINCT u.id)                                                          AS clientes_con_pedido,
      COUNT(DISTINCT u.id) FILTER (WHERE u.push_token LIKE 'ExponentPushToken%')    AS con_token
    FROM usuarios u
    JOIN pedidos p ON (p.cliente_id = u.id OR p.cliente_telefono = u.telefono)
    WHERE u.rol = 'cliente'`);
  const a = act[0];
  console.log(`\nClientes que YA pidieron: ${a.clientes_con_pedido} · con token: ${a.con_token} (${pct(Number(a.con_token), Number(a.clientes_con_pedido))})`);

  // 5) ¿La columna existe / hay tokens del todo?
  if (tCon === 0) {
    console.log("\n🔴 CERO tokens en toda la BD → el registro NUNCA llega al backend.");
    console.log("   Sospechas (en orden): (a) todos prueban en Expo Go [SDK 53+ no soporta push];");
    console.log("   (b) el build de prod no tiene capability de push (iOS: APNs; Android: FCM V1 en EAS);");
    console.log("   (c) getExpoPushTokenAsync truena y el catch lo silencia.");
  } else {
    console.log("\n🟢 Hay tokens: el pipeline funciona para algunos. Si un rol/plataforma está en 0%,");
    console.log("   el problema es específico de esa plataforma (permiso denegado, o build sin push).");
  }

  console.log("");
}

main()
  .catch((e) => { console.error("\n✖ Error:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
