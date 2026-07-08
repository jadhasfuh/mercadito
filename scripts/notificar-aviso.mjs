#!/usr/bin/env node
// Manda un push (Expo) de aviso a personas buscadas por nombre/rol.
//
// Caso de uso: avisarle a un cliente que no pudimos procesar su pedido porque
// no contesta teléfono/WhatsApp, y mandar el MISMO push al repartidor y al
// admin para ver cómo se ve lo que le llega al cliente.
//
// NO usa ningún endpoint: hace el push directo a la API pública de Expo
// (https://exp.host/--/api/v2/push/send), igual que src/lib/push.ts. Lo único
// que necesita es DATABASE_URL (para leer los push_token) y que cada persona
// haya iniciado sesión en la app móvil al menos una vez (así se guardó su token).
//
// Uso:
//   DATABASE_URL=... node scripts/notificar-aviso.mjs --dry     # muestra a quién llegaría, sin enviar
//   DATABASE_URL=... node scripts/notificar-aviso.mjs           # envía de verdad
//
// El título/cuerpo y los destinatarios están abajo en CONFIG.
import pg from "pg";

const DRY = process.argv.includes("--dry");

// ── CONFIG ────────────────────────────────────────────────────────────────
// Texto que verá el cliente. El mismo se manda a repartidor y admin de copia.
const TITULO = "Mercadito · Tu pedido";
const CUERPO =
  "Hola Jesse, no pudimos procesar tu pedido porque no logramos contactarte: " +
  "tu teléfono no contesta llamadas ni WhatsApp. Escríbenos para retomarlo. 🙏";

// A quién buscar. `nombre` hace match parcial (ILIKE %...%); `rol` es opcional
// pero recomendado para desambiguar. `principal` marca al destinatario real
// (los demás son copias de vista previa).
const DESTINATARIOS = [
  { etiqueta: "Cliente (destinatario real)", nombre: "Jesse Vega", rol: "cliente", principal: true },
  { etiqueta: "Repartidor (vista previa)",   nombre: "Fernando",   rol: "repartidor" },
  { etiqueta: "Admin (vista previa)",        nombre: null,         rol: "admin" },
];
// ──────────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✖ Falta DATABASE_URL. Corre:  DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/postgres' node scripts/notificar-aviso.mjs --dry");
  process.exit(1);
}

// Mismo ajuste que los demás scripts: quita un password placeholder vacío o
// "[YOUR-PASSWORD]" de la URL (inofensivo si ya trae password real).
const sinPass = DATABASE_URL.replace(/(\/\/[^:/@]+):(\[YOUR-PASSWORD\]|)@/, "$1@");
const pool = new pg.Pool({ connectionString: sinPass, ssl: { rejectUnauthorized: false } });

async function buscar({ nombre, rol }) {
  const where = [];
  const params = [];
  if (nombre) { params.push(`%${nombre}%`); where.push(`u.nombre ILIKE $${params.length}`); }
  if (rol)    { params.push(rol);            where.push(`u.rol = $${params.length}`); }
  const sql = `
    SELECT u.id, u.nombre, u.rol, u.telefono, u.push_token, u.activo
    FROM usuarios u
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY u.nombre`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function enviarPush(tokens, title, body) {
  const valid = tokens.filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));
  if (valid.length === 0) return { tickets: [], skipped: true };
  const messages = valid.map((to) => ({ to, title, body, priority: "high", sound: "default", channelId: "default" }));
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Expo ${res.status}: ${JSON.stringify(json)}`);
  return { tickets: json?.data ?? [], skipped: false };
}

async function main() {
  console.log(`\n${DRY ? "🔎 DRY RUN (no se envía nada)" : "🚀 ENVÍO REAL"}`);
  console.log(`Título: ${TITULO}`);
  console.log(`Cuerpo: ${CUERPO}\n`);

  const tokens = [];
  for (const d of DESTINATARIOS) {
    const rows = await buscar(d);
    console.log(`── ${d.etiqueta}  (buscar: nombre~"${d.nombre ?? "*"}", rol=${d.rol ?? "*"})`);
    if (rows.length === 0) { console.log("   ⚠ sin coincidencias en usuarios\n"); continue; }
    for (const r of rows) {
      const tieneToken = !!r.push_token && r.push_token.startsWith("ExponentPushToken");
      console.log(
        `   ${tieneToken ? "✅" : "⚠️ "} ${r.nombre} · ${r.rol} · ${r.telefono ?? "s/tel"}` +
        `${r.activo === false ? " · INACTIVO" : ""}` +
        `${tieneToken ? "" : "  (sin push_token — no ha entrado a la app; NO recibirá)"}`
      );
      if (tieneToken) tokens.push(r.push_token);
    }
    console.log("");
  }

  const unicos = [...new Set(tokens)];
  console.log(`Total de dispositivos con token: ${unicos.length}`);

  if (DRY) { console.log("\n(DRY RUN: no se envió. Quita --dry para enviar de verdad.)"); return; }
  if (unicos.length === 0) { console.log("\nNada que enviar (ningún destinatario tiene push_token)."); return; }

  const { tickets } = await enviarPush(unicos, TITULO, CUERPO);
  const ok = tickets.filter((t) => t.status === "ok").length;
  const err = tickets.filter((t) => t.status !== "ok");
  console.log(`\n✅ Enviados OK: ${ok}/${tickets.length}`);
  if (err.length) console.log("❌ Con error:", JSON.stringify(err, null, 2));
}

main()
  .catch((e) => { console.error("\n✖ Error:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
