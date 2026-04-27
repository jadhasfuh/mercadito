import { NextResponse } from "next/server";
import { ventanasComunes } from "@/lib/ventanasComunes";

// GET /api/puestos/ventanas-comunes?ids=A,B,C[&dias=4]
// Devuelve ventanas en que TODAS las tiendas dadas estarán abiertas, en
// los próximos N días. La UI las muestra como chips para que el cliente
// elija una hora válida — sin posibilidad de agendar a un horario donde
// alguna tienda no abre.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const dias = Math.min(14, Math.max(1, Number(searchParams.get("dias") ?? "7")));
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ ahora_disponible: true, ventanas: [] });
  const out = await ventanasComunes(ids, dias);
  return NextResponse.json(out, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  });
}
