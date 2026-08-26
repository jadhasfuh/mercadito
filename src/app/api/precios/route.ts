import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { aprobarSiTieneProductos } from "@/lib/aprobacion";
import { diasValidos, horaValida } from "@/lib/precioPromo";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function PUT(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { producto_id, puesto_id, precio, precio_mayoreo, mayoreo_desde } = body;

  if (!producto_id || !puesto_id || precio == null) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  if (usuario.rol !== "admin" && puesto_id !== usuario.puesto_id) {
    return NextResponse.json({ error: "Solo puedes actualizar precios de tu tienda" }, { status: 403 });
  }

  // Validación de mayoreo: ambos campos o ninguno, precio_mayoreo < precio, threshold > 0
  let mayoreoPrecio: number | null = null;
  let mayoreoDesde: number | null = null;
  if (precio_mayoreo != null || mayoreo_desde != null) {
    const pm = Number(precio_mayoreo);
    const md = Number(mayoreo_desde);
    if (!isFinite(pm) || pm <= 0) return NextResponse.json({ error: "precio_mayoreo inválido" }, { status: 400 });
    if (!isFinite(md) || md <= 0) return NextResponse.json({ error: "mayoreo_desde debe ser mayor a 0" }, { status: 400 });
    if (pm >= Number(precio)) return NextResponse.json({ error: "El precio de mayoreo debe ser menor al precio normal" }, { status: 400 });
    mayoreoPrecio = pm;
    mayoreoDesde = md;
  }

  const hoy = new Date().toISOString().split("T")[0];

  await query(
    "UPDATE precios SET activo = false WHERE producto_id = $1 AND puesto_id = $2 AND activo = true",
    [producto_id, puesto_id]
  );

  const id = uuidv4();
  await query(
    "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, precio_mayoreo, mayoreo_desde) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, producto_id, puesto_id, precio, hoy, mayoreoPrecio, mayoreoDesde]
  );

  // Su primer producto con precio aprueba al negocio (ver lib/aprobacion).
  await aprobarSiTieneProductos(puesto_id);

  return NextResponse.json({ ok: true, id, precio, precio_mayoreo: mayoreoPrecio, mayoreo_desde: mayoreoDesde, fecha: hoy });
}

/**
 * PATCH /api/precios — promoción de un producto.
 *
 * Body: { producto_id, puesto_id, promo: { precio, etiqueta?, dias?, desde?,
 *         hasta?, termina? } | null }  ·  promo:null la quita.
 *
 * Va aparte del PUT a propósito: ese archiva la fila de precio y crea una
 * nueva (lleva historial), así que si la promo viajara ahí, cada cambio de
 * precio de lista borraría la promo en silencio. Aquí sólo se tocan las
 * columnas de promo de la fila ACTIVA.
 */
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (usuario.rol !== "tienda" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { producto_id, puesto_id, promo } = body;
  if (!producto_id || !puesto_id) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  if (usuario.rol !== "admin" && puesto_id !== usuario.puesto_id) {
    return NextResponse.json({ error: "Solo puedes cambiar promociones de tu tienda" }, { status: 403 });
  }

  const fila = await queryOne<{ id: string; precio: string }>(
    "SELECT id, precio FROM precios WHERE producto_id = $1 AND puesto_id = $2 AND activo = true LIMIT 1",
    [producto_id, puesto_id]
  );
  if (!fila) return NextResponse.json({ error: "Ese producto no tiene precio en tu tienda" }, { status: 404 });

  if (promo == null) {
    await query(
      `UPDATE precios SET precio_promo = NULL, promo_dias = NULL, promo_desde = NULL,
                          promo_hasta = NULL, promo_termina = NULL, promo_etiqueta = NULL
       WHERE id = $1`,
      [fila.id]
    );
    return NextResponse.json({ ok: true, promo: null });
  }

  const precioPromo = Number(promo?.precio);
  if (!isFinite(precioPromo) || precioPromo <= 0) {
    return NextResponse.json({ error: "El precio de promoción no es válido" }, { status: 400 });
  }
  // Una "promo" más cara que el precio normal no es una promo, es un error de
  // captura que el cliente vería como un aumento anunciado.
  if (precioPromo >= Number(fila.precio)) {
    return NextResponse.json({ error: "El precio de promoción debe ser menor al normal" }, { status: 400 });
  }

  const dias = diasValidos(promo?.dias);
  const desde = horaValida(promo?.desde);
  const hasta = horaValida(promo?.hasta);
  // Media franja no se puede evaluar: o van las dos horas o ninguna.
  if ((desde && !hasta) || (!desde && hasta)) {
    return NextResponse.json({ error: "Escribe la hora de inicio y la de fin, o déjalas vacías" }, { status: 400 });
  }
  if (desde && hasta && desde >= hasta) {
    return NextResponse.json({ error: "La hora de fin debe ser mayor a la de inicio" }, { status: 400 });
  }
  const termina = typeof promo?.termina === "string" && /^\d{4}-\d{2}-\d{2}$/.test(promo.termina) ? promo.termina : null;
  const etiqueta = String(promo?.etiqueta || "").trim().slice(0, 40) || null;

  await query(
    `UPDATE precios SET precio_promo = $2, promo_dias = $3, promo_desde = $4,
                        promo_hasta = $5, promo_termina = $6, promo_etiqueta = $7
     WHERE id = $1`,
    [fila.id, precioPromo, dias.length ? JSON.stringify(dias) : null, desde, hasta, termina, etiqueta]
  );

  return NextResponse.json({
    ok: true,
    promo: { precio: precioPromo, etiqueta, dias, desde, hasta, termina },
  });
}
