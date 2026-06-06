import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { subirImagenSiBase64, storageDisponible } from "@/lib/storage";
import { NextResponse } from "next/server";

// POST /api/admin/migrar-imagenes — convierte las imágenes base64 de productos
// a archivos en Supabase Storage (bucket) y deja la URL en la DB.
// Idempotente y por lotes: procesa `limite` por llamada (default 25). El admin
// la llama repetidamente hasta que `restantes` = 0.
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (!storageDisponible()) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_URL y SUPABASE_SERVICE_KEY en Railway (y crear el bucket 'productos')." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({} as { limite?: number }));
  const limite = Math.min(Math.max(parseInt(String(body?.limite ?? 25), 10) || 25, 1), 100);

  const pendientes = await query<{ id: string; imagen: string }>(
    "SELECT id, imagen FROM productos WHERE imagen LIKE 'data:image%' LIMIT $1",
    [limite]
  );

  let migradas = 0;
  const errores: string[] = [];
  for (const p of pendientes) {
    const url = await subirImagenSiBase64(p.imagen, p.id);
    if (typeof url === "string" && url.startsWith("http")) {
      await query("UPDATE productos SET imagen = $1 WHERE id = $2", [url, p.id]);
      migradas++;
    } else {
      errores.push(p.id); // no se pudo subir (fallback dejó el base64)
    }
  }

  const [{ restantes }] = await query<{ restantes: string }>(
    "SELECT COUNT(*) AS restantes FROM productos WHERE imagen LIKE 'data:image%'"
  );

  return NextResponse.json({ ok: true, migradas, restantes: parseInt(restantes), errores });
}
