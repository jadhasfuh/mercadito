import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";

// POST /api/repartidor/ubicacion
// El repartidor reporta su ubicación actual. Se guarda en usuarios para
// que el cliente del cliente la consulte por pedido (vía
// /api/mis-pedidos → repartidor_ubicacion).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }
  // Sanity check: dentro del bounding box continental aproximado.
  if (lat < -60 || lat > 60 || lng < -130 || lng > 30) {
    return NextResponse.json({ error: "Coordenadas fuera de rango" }, { status: 400 });
  }
  await query(
    "UPDATE usuarios SET ubicacion_lat = $1, ubicacion_lng = $2, ubicacion_at = NOW() WHERE id = $3",
    [lat, lng, usuario.id]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/repartidor/ubicacion — apagar tracking.
export async function DELETE() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  await query(
    "UPDATE usuarios SET ubicacion_lat = NULL, ubicacion_lng = NULL, ubicacion_at = NULL WHERE id = $1",
    [usuario.id]
  );
  return NextResponse.json({ ok: true });
}
