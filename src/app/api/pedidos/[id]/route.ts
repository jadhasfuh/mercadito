import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { estado, repartidor_id } = body;

  // Assign repartidor — only repartidores (to themselves) or admin
  if (repartidor_id !== undefined) {
    if (usuario.rol === "repartidor") {
      if (repartidor_id !== null && repartidor_id !== usuario.id) {
        return NextResponse.json({ error: "Solo puedes asignarte a ti mismo" }, { status: 403 });
      }
    } else if (usuario.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    await query("UPDATE pedidos SET repartidor_id = $1 WHERE id = $2", [repartidor_id, id]);
    if (!estado) {
      return NextResponse.json({ ok: true });
    }
  }

  if (estado) {
    const validStates = ["pendiente", "en_compra", "en_camino", "entregado", "cancelado"];
    if (!validStates.includes(estado)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    // Clients can only cancel their own pendiente orders
    if (usuario.rol === "cliente") {
      if (estado !== "cancelado") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      const pedido = await queryOne(
        "SELECT id, estado, cliente_id, cliente_telefono FROM pedidos WHERE id = $1",
        [id]
      );
      if (!pedido) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }
      const isOwner = pedido.cliente_id === usuario.id || pedido.cliente_telefono === usuario.telefono;
      if (!isOwner) {
        return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
      }
      if (pedido.estado !== "pendiente") {
        return NextResponse.json({ error: "Solo puedes cancelar pedidos pendientes" }, { status: 400 });
      }
    } else if (usuario.rol !== "repartidor" && usuario.rol !== "admin") {
      // Only repartidor and admin can change order states
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const result = await query(
      "UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING id",
      [estado, id]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, estado });
  }

  return NextResponse.json({ ok: true });
}
