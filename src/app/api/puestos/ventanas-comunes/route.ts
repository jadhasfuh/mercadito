import { NextResponse } from "next/server";
import { ventanasComunes } from "@/lib/ventanasComunes";

// GET /api/puestos/ventanas-comunes?ids=A,B,C[&dias=4]
//   - `ids`: lista de puesto_id separados por coma (modo legacy: lead a nivel puesto)
//   - `pares`: lista de "producto_id:puesto_id" separados por coma (override de
//     lead a nivel producto cuando aplica). Si se pasa `pares`, `ids` se ignora.
// Devuelve ventanas en que TODAS las tiendas dadas estarán abiertas, en
// los próximos N días. La UI las muestra como chips para que el cliente
// elija una hora válida.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dias = Math.min(14, Math.max(1, Number(searchParams.get("dias") ?? "7")));

  const paresParam = searchParams.get("pares") ?? "";
  if (paresParam) {
    const pares = paresParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [producto_id, puesto_id] = s.split(":");
        return { producto_id, puesto_id };
      })
      .filter((p) => p.producto_id && p.puesto_id);
    if (pares.length === 0) return NextResponse.json({ ahora_disponible: true, ventanas: [] });
    const out = await ventanasComunes(pares, dias);
    return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=60" } });
  }

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ ahora_disponible: true, ventanas: [] });
  const out = await ventanasComunes(ids, dias);
  return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=60" } });
}
