import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// Favoritos del cliente — platillos y negocios.
//
// El cliente SIEMPRE guarda primero en su dispositivo (localStorage / Async-
// Storage): la mayoría del tráfico del menú llega por QR y sin cuenta, y un
// corazón que exige login no lo toca nadie. Esto es la copia de la cuenta,
// para que los favoritos crucen del teléfono al navegador. Por eso el GET
// responde 200 aunque no haya sesión (con `autenticado: false`) en lugar de
// 401: al cliente le sirve saber "no hay nada que sincronizar", no un error.

const TIPOS = new Set(["producto", "puesto"]);

interface Favoritos { productos: string[]; puestos: string[] }

async function leer(usuarioId: string): Promise<Favoritos> {
  const filas = await query<{ tipo: string; ref_id: string }>(
    "SELECT tipo, ref_id FROM favoritos WHERE usuario_id = $1",
    [usuarioId]
  );
  return {
    productos: filas.filter((f) => f.tipo === "producto").map((f) => f.ref_id),
    puestos: filas.filter((f) => f.tipo === "puesto").map((f) => f.ref_id),
  };
}

/** Ids válidos y en cantidad razonable — el body lo manda el cliente. */
function limpiarIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64).slice(0, 500);
}

export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ autenticado: false, productos: [], puestos: [] });
  return NextResponse.json({ autenticado: true, ...(await leer(usuario.id)) });
}

/** POST { tipo, ref_id, activo } — prende o apaga un favorito. */
export async function POST(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tipo = typeof body?.tipo === "string" ? body.tipo : "";
  const refId = typeof body?.ref_id === "string" ? body.ref_id : "";
  if (!TIPOS.has(tipo) || !refId || refId.length > 64) {
    return NextResponse.json({ error: "Favorito inválido" }, { status: 400 });
  }

  if (body?.activo === false) {
    await query("DELETE FROM favoritos WHERE usuario_id = $1 AND tipo = $2 AND ref_id = $3", [usuario.id, tipo, refId]);
  } else {
    await query(
      `INSERT INTO favoritos (usuario_id, tipo, ref_id) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id, tipo, ref_id) DO NOTHING`,
      [usuario.id, tipo, refId]
    );
  }
  return NextResponse.json({ ok: true, ...(await leer(usuario.id)) });
}

/** PUT { productos, puestos } — sube lo que el dispositivo tenía guardado al
 *  iniciar sesión y devuelve la unión. Une, nunca borra: el usuario que ya
 *  tenía favoritos en la cuenta no los pierde por abrir en otro teléfono. */
export async function PUT(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pares: [string, string][] = [
    ...limpiarIds(body?.productos).map((id): [string, string] => ["producto", id]),
    ...limpiarIds(body?.puestos).map((id): [string, string] => ["puesto", id]),
  ];
  for (const [tipo, refId] of pares) {
    await query(
      `INSERT INTO favoritos (usuario_id, tipo, ref_id) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id, tipo, ref_id) DO NOTHING`,
      [usuario.id, tipo, refId]
    ).catch(() => {});
  }
  return NextResponse.json({ ok: true, ...(await leer(usuario.id)) });
}
