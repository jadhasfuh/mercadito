/**
 * Arnés de pruebas: cronómetro por caso, tope de tiempo y reporte.
 *
 * Cada caso se corre con un límite: una prueba que se cuelga (una consulta que
 * nunca vuelve, un endpoint que se traba) tiene que FALLAR con su nombre, no
 * dejar la suite congelada sin decir cuál fue. El tiempo de cada una se imprime
 * porque una prueba que de pronto tarda 10x suele ser un índice que se perdió.
 */

const TOPE_MS = Number(process.env.TOPE_MS || 15000);
export const BASE = process.env.BASE_URL || "http://127.0.0.1:3199";

const grupos = [];
let grupoActual = null;

export function describe(nombre, fn) {
  grupoActual = { nombre, casos: [] };
  grupos.push(grupoActual);
  fn();
  grupoActual = null;
}

export function it(nombre, fn) {
  if (!grupoActual) throw new Error("it() fuera de un describe()");
  grupoActual.casos.push({ nombre, fn });
}

// ── Aserciones ───────────────────────────────────────────────────────────
export function ok(cond, mensaje) {
  if (!cond) throw new Error(mensaje || "se esperaba verdadero");
}
export function igual(actual, esperado, mensaje) {
  // Comparación laxa a propósito para números que vuelven como string desde
  // Postgres ("120.00" vs 120): lo que se prueba es el valor, no el tipo.
  const a = typeof esperado === "number" ? Number(actual) : actual;
  if (a !== esperado) {
    throw new Error(`${mensaje || "valores distintos"} — esperaba ${JSON.stringify(esperado)}, llegó ${JSON.stringify(actual)}`);
  }
}
export function cerca(actual, esperado, mensaje) {
  if (Math.abs(Number(actual) - Number(esperado)) > 0.011) {
    throw new Error(`${mensaje || "montos distintos"} — esperaba ${esperado}, llegó ${actual}`);
  }
}

// ── Cliente HTTP ─────────────────────────────────────────────────────────
/** Petición al servidor de pruebas. `token` viaja como X-Session-Token, que es
 *  la vía que usa la app nativa (la web usa cookie, misma sesión). */
export async function api(metodo, ruta, { token, body } = {}) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { status: res.status, datos };
}

// ── Corredor ─────────────────────────────────────────────────────────────
function conTope(promesa, nombre) {
  let id;
  const tope = new Promise((_, rechazar) => {
    id = setTimeout(() => rechazar(new Error(`se pasó del tope de ${TOPE_MS} ms`)), TOPE_MS);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(id));
}

export async function correr() {
  const inicio = performance.now();
  let pasaron = 0;
  const fallos = [];

  for (const grupo of grupos) {
    console.log(`\n\x1b[1m${grupo.nombre}\x1b[0m`);
    for (const caso of grupo.casos) {
      const t0 = performance.now();
      try {
        await conTope(Promise.resolve().then(caso.fn), caso.nombre);
        const ms = performance.now() - t0;
        // Marcamos las lentas: en una suite local, medio segundo ya es señal
        // de que algo hace más trabajo del que debería.
        const lenta = ms > 500 ? " \x1b[33m← lenta\x1b[0m" : "";
        console.log(`  \x1b[32m✓\x1b[0m ${caso.nombre} \x1b[90m(${ms.toFixed(0)} ms)\x1b[0m${lenta}`);
        pasaron++;
      } catch (e) {
        const ms = performance.now() - t0;
        console.log(`  \x1b[31m✗ ${caso.nombre}\x1b[0m \x1b[90m(${ms.toFixed(0)} ms)\x1b[0m`);
        console.log(`      \x1b[31m${e.message}\x1b[0m`);
        fallos.push({ grupo: grupo.nombre, caso: caso.nombre, error: e.message });
      }
    }
  }

  const total = performance.now() - inicio;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`\x1b[1m${pasaron} pasaron, ${fallos.length} fallaron\x1b[0m  \x1b[90m(${(total / 1000).toFixed(1)} s)\x1b[0m`);
  if (fallos.length) {
    console.log("\n\x1b[1mFallos:\x1b[0m");
    for (const f of fallos) console.log(`  · ${f.grupo} → ${f.caso}\n    ${f.error}`);
  }
  return fallos.length;
}
