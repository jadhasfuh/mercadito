import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";

// PATCH — edit product name/unit/category
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { nombre, categoria_id, unidad, descripcion, imagen, seccion, subseccion, disponible, horario_ids } = body;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (nombre) {
    const bloqueado = verificarListaNegra(nombre);
    if (bloqueado) {
      return NextResponse.json({ error: "El nombre contiene contenido no permitido" }, { status: 400 });
    }
    updates.push(`nombre = $${idx++}`); values.push(nombre);
  }
  if (categoria_id) { updates.push(`categoria_id = $${idx++}`); values.push(categoria_id); }
  if (unidad) { updates.push(`unidad = $${idx++}`); values.push(unidad); }
  if (descripcion !== undefined) { updates.push(`descripcion = $${idx++}`); values.push(descripcion || null); }
  if (imagen !== undefined) { updates.push(`imagen = $${idx++}`); values.push(imagen || null); }
  if (seccion !== undefined) { updates.push(`seccion = $${idx++}`); values.push(seccion || null); }
  if (subseccion !== undefined) { updates.push(`subseccion = $${idx++}`); values.push(subseccion || null); }
  if (disponible !== undefined) { updates.push(`disponible = $${idx++}`); values.push(disponible); }

  if (updates.length === 0 && horario_ids === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  if (updates.length > 0) {
    values.push(id);
    const result = await query(
      `UPDATE productos SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id`,
      values
    );
    if (result.length === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
  }

  // Replace the product's horarios with the given set.
  // horario_ids === undefined → leave links untouched.
  // horario_ids === [] → remove all links (product becomes always-available).
  if (Array.isArray(horario_ids)) {
    await query("DELETE FROM producto_horarios WHERE producto_id = $1", [id]);
    if (horario_ids.length > 0) {
      // Scope to the owner's puesto (or any puesto if admin)
      const puestoFiltro = usuario.rol === "admin"
        ? ""
        : " AND puesto_id = $2";
      const params: unknown[] = [horario_ids];
      if (usuario.rol !== "admin") params.push(usuario.puesto_id);
      const validos = await query(
        `SELECT id FROM puesto_horarios WHERE id = ANY($1)${puestoFiltro}`,
        params
      );
      for (const { id: hid } of validos) {
        await query(
          "INSERT INTO producto_horarios (producto_id, horario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, hid]
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove product and its prices
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  // Anyone but admin can only fully delete products whose only price is their own
  if (usuario.rol !== "admin") {
    if (!usuario.puesto_id) {
      return NextResponse.json({ error: "Solo el admin puede eliminar productos sin puesto" }, { status: 403 });
    }
    const otherPrices = await query(
      "SELECT id FROM precios WHERE producto_id = $1 AND puesto_id != $2 AND activo = true",
      [id, usuario.puesto_id]
    );
    if (otherPrices.length > 0) {
      return NextResponse.json({ error: "Este producto tiene precios de otras tiendas, solo puedes quitar tu precio" }, { status: 403 });
    }
  }

  // Check if product is in any active order
  const inOrders = await query(
    `SELECT pi.id FROM pedido_items pi
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE pi.producto_id = $1 AND p.estado NOT IN ('entregado', 'cancelado')`,
    [id]
  );
  if (inOrders.length > 0) {
    return NextResponse.json({ error: "No se puede eliminar, este producto esta en pedidos activos" }, { status: 400 });
  }

  // Delete prices first, then product
  await query("DELETE FROM precios WHERE producto_id = $1", [id]);
  await query("DELETE FROM pedido_items WHERE producto_id = $1", [id]);
  const result = await query("DELETE FROM productos WHERE id = $1 RETURNING id", [id]);

  if (result.length === 0) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
