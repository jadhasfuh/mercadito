// Test end-to-end del flujo de mesa con DOS comensales a destiempo.
//
// Qué comprueba:
//   1. Cada mesa abre su propia cuenta (y no se mezclan entre sí).
//   2. Volver a pedir a la misma mesa SE SUMA a la cuenta que ya estaba
//      abierta, en vez de abrir una nueva.
//   3. Las dos cuentas aparecen a la vez en el panel de la tienda.
//   4. Los totales de cada cuenta cuadran con lo que pidió cada quien.
//   5. Cada cuenta cierra con su propio método de pago.
//   6. Al cerrar, la cuenta sale del panel (y la mesa queda libre).
//
// Uso:
//   BASE=http://localhost:3000 \
//   TIENDA_TEL=... TIENDA_PIN=... \
//   MESA_A=<token> MESA_B=<token> \
//   node scripts/test-mesas-concurrentes.mjs
//
// Los tokens de mesa salen del panel de la tienda (Mesas → el QR lleva
// /m/<puesto>/mesa/<token>). NO apuntes esto a producción: crea cuentas y
// pedidos reales y le manda push al dueño.

const BASE = process.env.BASE || "http://localhost:3000";
const TIENDA_TEL = process.env.TIENDA_TEL;
const TIENDA_PIN = process.env.TIENDA_PIN;
const MESA_A = process.env.MESA_A;
const MESA_B = process.env.MESA_B;

if (!TIENDA_TEL || !TIENDA_PIN || !MESA_A || !MESA_B) {
  console.error("Faltan variables: TIENDA_TEL, TIENDA_PIN, MESA_A, MESA_B");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const paso = (ok, txt, extra = "") => {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${txt}${extra ? `  ${extra}` : ""}`);
};

async function json(res) {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 200) }; }
}

/** Sesión de tienda: guarda la cookie para consultar el panel. */
async function loginTienda() {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "tienda", telefono: TIENDA_TEL, pin: TIENDA_PIN }),
  });
  const cookie = res.headers.get("set-cookie");
  if (!res.ok || !cookie) throw new Error(`login tienda falló: ${res.status} ${JSON.stringify(await json(res))}`);
  return cookie.split(";")[0];
}

// ── Acciones de un comensal ────────────────────────────────────────────
const abrirMesa = (token) =>
  fetch(`${BASE}/api/mesa/${token}/abrir`, { method: "POST" }).then(json);

const pedir = (token, cuentaId, items) =>
  fetch(`${BASE}/api/mesa/${token}/pedido`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuenta_id: cuentaId, items }),
  }).then(json);

const verCuenta = (token) => fetch(`${BASE}/api/mesa/${token}/cuenta`).then(json);

const comandas = (cookie) =>
  fetch(`${BASE}/api/tienda/comandas`, { headers: { cookie } }).then(json);

const cerrar = (cookie, cuentaId, metodo) =>
  fetch(`${BASE}/api/cuentas/${cuentaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "cerrar", metodo_pago: metodo, propina: 0 }),
  }).then(json);

/** Productos con precio activo de la tienda, para pedir cosas que existen. */
async function productosDe(puestoId) {
  const menu = await fetch(`${BASE}/api/menu/${puestoId}`).then(json);
  const prods = [];
  for (const sec of menu.secciones ?? []) {
    for (const g of sec.grupos ?? []) for (const p of g.productos ?? []) prods.push(p);
  }
  return prods;
}

async function main() {
  console.log(`\n═══ Test de mesas concurrentes · ${BASE} ═══\n`);
  const cookie = await loginTienda();

  // ── t=0 · Comensal A se sienta y abre su mesa ──────────────────────
  console.log("t=0.0s · Comensal A abre la mesa");
  const a0 = await abrirMesa(MESA_A);
  paso(!!a0.cuenta_id, "A abre cuenta", a0.cuenta_id ?? JSON.stringify(a0));
  const prods = await productosDe(a0.puesto?.id);
  paso(prods.length >= 2, `la tienda tiene productos para pedir`, `${prods.length} productos`);
  if (!a0.cuenta_id || prods.length < 2) { console.log("\nNo se puede seguir."); process.exit(1); }

  // Productos SIN variantes: el endpoint exige elegir presentación si el
  // producto tiene, y aquí queremos probar el flujo de cuentas, no eso.
  const simples = prods.filter((p) => (p.variantes ?? []).length === 0);
  const [p1, p2] = simples.length >= 2 ? simples : prods;

  const pedA1 = await pedir(MESA_A, a0.cuenta_id, [{ producto_id: p1.id, cantidad: 2 }]);
  paso(pedA1.ok === true, "A pide 2× " + p1.nombre, pedA1.ok ? `$${pedA1.total}` : JSON.stringify(pedA1));

  // ── t=2 · Comensal B se sienta en OTRA mesa ────────────────────────
  await dormir(2000);
  console.log("\nt=2.0s · Comensal B abre otra mesa");
  const b0 = await abrirMesa(MESA_B);
  paso(!!b0.cuenta_id, "B abre cuenta", b0.cuenta_id ?? JSON.stringify(b0));
  paso(b0.cuenta_id !== a0.cuenta_id, "las cuentas de A y B son distintas");

  const pedB1 = await pedir(MESA_B, b0.cuenta_id, [{ producto_id: p2.id, cantidad: 1 }]);
  paso(pedB1.ok === true, "B pide 1× " + p2.nombre, pedB1.ok ? `$${pedB1.total}` : JSON.stringify(pedB1));

  // ── t=3 · ¿La tienda ve las DOS mesas al mismo tiempo? ─────────────
  await dormir(1000);
  console.log("\nt=3.0s · Panel de la tienda");
  const c1 = await comandas(cookie);
  const cuentasVistas = Array.isArray(c1) ? c1.map((x) => x.cuenta_id) : [];
  paso(cuentasVistas.includes(a0.cuenta_id), "la cuenta de A aparece en el panel");
  paso(cuentasVistas.includes(b0.cuenta_id), "la cuenta de B aparece en el panel");

  // ── t=5 · A pide OTRA vez: debe sumarse a su cuenta ────────────────
  await dormir(2000);
  console.log("\nt=5.0s · A vuelve a pedir (misma mesa)");
  const aRe = await abrirMesa(MESA_A);
  paso(aRe.cuenta_id === a0.cuenta_id, "reabrir la mesa devuelve la MISMA cuenta (no crea otra)");
  const pedA2 = await pedir(MESA_A, a0.cuenta_id, [{ producto_id: p2.id, cantidad: 3 }]);
  paso(pedA2.ok === true, "A pide 3× " + p2.nombre, pedA2.ok ? `$${pedA2.total}` : JSON.stringify(pedA2));

  const ctaA = await verCuenta(MESA_A);
  const esperadoA = Number(pedA1.total) + Number(pedA2.total);
  paso(
    Math.abs(Number(ctaA.total) - esperadoA) < 0.01,
    "el total de A suma sus dos pedidos",
    `$${ctaA.total} vs $${esperadoA.toFixed(2)} esperado`
  );

  // ── t=8 · B vuelve a pedir ─────────────────────────────────────────
  await dormir(3000);
  console.log("\nt=8.0s · B vuelve a pedir");
  const pedB2 = await pedir(MESA_B, b0.cuenta_id, [{ producto_id: p1.id, cantidad: 1 }]);
  paso(pedB2.ok === true, "B pide 1× " + p1.nombre, pedB2.ok ? `$${pedB2.total}` : JSON.stringify(pedB2));

  const ctaB = await verCuenta(MESA_B);
  const esperadoB = Number(pedB1.total) + Number(pedB2.total);
  paso(
    Math.abs(Number(ctaB.total) - esperadoB) < 0.01,
    "el total de B suma sus dos pedidos",
    `$${ctaB.total} vs $${esperadoB.toFixed(2)} esperado`
  );

  // Lo más importante: que no se hayan cruzado.
  paso(
    Math.abs(Number(ctaA.total) - Number(ctaB.total)) > 0.001 || esperadoA === esperadoB,
    "las cuentas no se mezclaron entre mesas"
  );
  const idsA = new Set((ctaA.items ?? []).map((i) => i.id));
  const cruce = (ctaB.items ?? []).some((i) => idsA.has(i.id));
  paso(!cruce, "ningún producto de B aparece en la cuenta de A");

  // ── t=9 · Cerrar cada cuenta con método DISTINTO ───────────────────
  await dormir(1000);
  console.log("\nt=9.0s · Cobro");
  const metodos = (await fetch(`${BASE}/api/menu/${a0.puesto?.id}`).then(json))?.puesto?.metodos_pago_mesa ?? ["caja"];
  const m1 = metodos[0] ?? "caja";
  const m2 = metodos[1] ?? metodos[0] ?? "caja";
  console.log(`  (métodos permitidos por la tienda: ${metodos.join(", ")})`);

  const cerrA = await cerrar(cookie, a0.cuenta_id, m1);
  paso(cerrA.ok === true, `cuenta de A cerrada con "${m1}"`, JSON.stringify(cerrA.metodo_pago ?? cerrA));
  const cerrB = await cerrar(cookie, b0.cuenta_id, m2);
  paso(cerrB.ok === true, `cuenta de B cerrada con "${m2}"`, JSON.stringify(cerrB.metodo_pago ?? cerrB));

  const c2 = await comandas(cookie);
  const quedan = Array.isArray(c2) ? c2.map((x) => x.cuenta_id) : [];
  paso(!quedan.includes(a0.cuenta_id), "la cuenta de A salió del panel al cobrarse");
  paso(!quedan.includes(b0.cuenta_id), "la cuenta de B salió del panel al cobrarse");

  // La mesa debe quedar libre: abrir otra vez da una cuenta NUEVA.
  const aNueva = await abrirMesa(MESA_A);
  paso(
    aNueva.cuenta_id && aNueva.cuenta_id !== a0.cuenta_id,
    "tras cobrar, la mesa abre una cuenta nueva (queda libre)"
  );

  console.log(`\n${fallos === 0 ? "✅ TODO BIEN" : `❌ ${fallos} fallo(s)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error("\n💥", e.message); process.exit(1); });
