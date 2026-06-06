import { query, withTransaction } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { aplicarOpcionesYVariantes, aplicarModificadores } from "@/lib/productoExtras";
import { subirImagenSiBase64 } from "@/lib/storage";
import { NextResponse } from "next/server";

// GET — producto público (sin sesión) para la página compartible
// /producto/[id]. Devuelve el producto + las tiendas activas/aprobadas que
// lo venden con su precio (más barato primero). Solo lo necesario para el
// preview + CTA; el flujo de compra vive en /cliente o la app.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await query<{
    id: string;
    nombre: string;
    descripcion: string | null;
    unidad: string | null;
    tiene_foto: boolean;
    puesto_id: string;
    puesto_nombre: string;
    precio: string;
    precio_mayoreo: string | null;
    mayoreo_desde: string | null;
  }>(
    `SELECT p.id, p.nombre, p.descripcion, p.unidad,
            (p.imagen IS NOT NULL AND p.imagen LIKE 'data:%') AS tiene_foto,
            pu.id AS puesto_id, pu.nombre AS puesto_nombre,
            pr.precio, pr.precio_mayoreo, pr.mayoreo_desde
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true
     JOIN puestos pu ON pu.id = pr.puesto_id AND pu.activo = true AND pu.aprobado = true
     WHERE p.id = $1 AND (p.disponible IS NULL OR p.disponible = true)
     ORDER BY pr.precio ASC`,
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Producto no disponible" }, { status: 404 });
  }

  const producto = {
    id: rows[0].id,
    nombre: rows[0].nombre,
    descripcion: rows[0].descripcion,
    unidad: rows[0].unidad,
    tiene_foto: rows[0].tiene_foto,
  };
  const ofertas = rows.map((r) => ({
    puesto_id: r.puesto_id,
    puesto_nombre: r.puesto_nombre,
    precio: Number(r.precio),
    precio_mayoreo: r.precio_mayoreo != null ? Number(r.precio_mayoreo) : null,
    mayoreo_desde: r.mayoreo_desde != null ? Number(r.mayoreo_desde) : null,
  }));

  return NextResponse.json({ producto, ofertas });
}

// PATCH — edit product name/unit/category
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { nombre, categoria_id, unidad, descripcion, imagen, seccion, subseccion, disponible, horario_ids, dias_semana, opciones, variantes, modificadores, lead_time_dias, permite_fraccion, permite_por_dinero, precio_variable_peso } = body;

  // Cantidad libre no convive con variantes. Verificamos contra el estado
  // actual: si el producto ya tiene variantes y se intenta activar uno de
  // los flags, rechazamos. Si en el mismo PATCH se están limpiando las
  // opciones (opciones === [] o []), el flag se permite — el caller debe
  // mandar primero el clear y luego el flag, o ambos juntos: aceptamos
  // ambos juntos validando contra el "estado final".
  const activandoCantidadLibre =
    (permite_fraccion === true) || (permite_por_dinero === true);
  if (activandoCantidadLibre) {
    const opcionesQuedanVacias = Array.isArray(opciones) && opciones.length === 0;
    if (!opcionesQuedanVacias) {
      const opcionesNuevasNoVacias = Array.isArray(opciones) && opciones.length > 0;
      if (opcionesNuevasNoVacias) {
        return NextResponse.json(
          { error: "Cantidad libre (fracción/por dinero) no aplica a productos con variantes" },
          { status: 400 }
        );
      }
      // No se tocan opciones en este PATCH — verificamos lo que está en BD.
      const tieneVariantesEnBd = await query<{ n: string }>(
        "SELECT COUNT(*)::int AS n FROM producto_opciones WHERE producto_id = $1",
        [id]
      );
      if (Number(tieneVariantesEnBd[0]?.n ?? 0) > 0) {
        return NextResponse.json(
          { error: "Cantidad libre (fracción/por dinero) no aplica a productos con variantes" },
          { status: 400 }
        );
      }
    }
  }

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
  if (imagen !== undefined) {
    // Solo aceptamos null (borrar), data: (foto nueva) o emoji: (ícono). Una
    // URL servida (/api/productos/{id}/imagen) es el espejo de LECTURA — si un
    // cliente la reenvía sin querer, NO debe sobreescribir el base64 guardado
    // (borraría la foto). En ese caso la ignoramos.
    const v = imagen || null;
    if (v === null || v.startsWith("data:") || v.startsWith("emoji:")) {
      // Foto nueva en base64 → la subimos al bucket y guardamos la URL.
      const vFinal = v && v.startsWith("data:") ? await subirImagenSiBase64(v, id) : v;
      updates.push(`imagen = $${idx++}`); values.push(vFinal);
    }
  }
  if (seccion !== undefined) { updates.push(`seccion = $${idx++}`); values.push(seccion || null); }
  if (subseccion !== undefined) { updates.push(`subseccion = $${idx++}`); values.push(subseccion || null); }
  if (disponible !== undefined) { updates.push(`disponible = $${idx++}`); values.push(disponible); }
  if (lead_time_dias !== undefined) {
    // null o "" → limpiar (hereda del puesto). Número → sobrescribe.
    const lead = lead_time_dias == null || lead_time_dias === ""
      ? null
      : Math.max(0, Math.floor(Number(lead_time_dias)));
    updates.push(`lead_time_dias = $${idx++}`); values.push(lead);
  }
  if (permite_fraccion !== undefined) {
    updates.push(`permite_fraccion = $${idx++}`); values.push(!!permite_fraccion);
  }
  if (permite_por_dinero !== undefined) {
    updates.push(`permite_por_dinero = $${idx++}`); values.push(!!permite_por_dinero);
  }
  if (precio_variable_peso !== undefined) {
    updates.push(`precio_variable_peso = $${idx++}`); values.push(!!precio_variable_peso);
  }

  if (updates.length === 0 && horario_ids === undefined && dias_semana === undefined && opciones === undefined && variantes === undefined && modificadores === undefined) {
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

  if (opciones !== undefined || variantes !== undefined) {
    await aplicarOpcionesYVariantes(id, opciones, variantes);
  }
  if (modificadores !== undefined) {
    await aplicarModificadores(id, modificadores);
  }

  // Replace product-day-of-week availability with the given set.
  // dias_semana === undefined → leave untouched.
  // dias_semana === [] → remove all (product becomes always-available).
  if (Array.isArray(dias_semana)) {
    await query("DELETE FROM producto_dias WHERE producto_id = $1", [id]);
    if (dias_semana.length > 0) {
      const limpios = Array.from(new Set(
        dias_semana
          .map((d: unknown) => Number(d))
          .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      ));
      for (const d of limpios) {
        await query(
          "INSERT INTO producto_dias (producto_id, dia_semana) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, d]
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

  // Borrado atómico: todos los hijos antes que el producto. Orden correcto de
  // FKs — primero pedido_items (tienen FK a productos), luego precios (FK a
  // productos), finalmente el producto. producto_variantes / opciones /
  // modificadores caen por ON DELETE CASCADE al borrar el producto.
  try {
    const found = await withTransaction(async (q) => {
      await q("DELETE FROM pedido_items WHERE producto_id = $1", [id]);
      await q("DELETE FROM precios WHERE producto_id = $1", [id]);
      const r = await q("DELETE FROM productos WHERE id = $1 RETURNING id", [id]);
      return r.length > 0;
    });
    if (!found) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
  } catch (e) {
    console.error("[productos DELETE] fallo", e);
    return NextResponse.json({ error: "No se pudo eliminar el producto" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
