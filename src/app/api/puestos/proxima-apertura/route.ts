import { NextResponse } from "next/server";
import { proximasAperturas } from "@/lib/proximaApertura";

// GET /api/puestos/proxima-apertura?ids=A,B,C[&ref=ISO]
// Devuelve un mapa { puesto_id: ISO | null } con la próxima apertura
// considerando puesto_horario_atencion. ref opcional permite preguntar
// "abre en X timestamp?" — si está abierto en ref devuelve ref.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const refParam = searchParams.get("ref");
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({});
  const ref = refParam ? new Date(refParam) : new Date();
  if (Number.isNaN(ref.getTime())) {
    return NextResponse.json({ error: "ref inválido" }, { status: 400 });
  }
  const out = await proximasAperturas(ids, ref);
  return NextResponse.json(out, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  });
}
