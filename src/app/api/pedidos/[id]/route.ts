import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

type EstadoPedido = "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";

const MENSAJE_POR_ESTADO: Record<EstadoPedido, { title: string; body: string } | null> = {
  pendiente: null, // nunca se "vuelve" a pendiente
  en_compra: { title: "Mercadito", body: "Tu pedido ya se está comprando 🛒" },
  en_camino: { title: "Mercadito", body: "Tu pedido va en camino 🛵" },
  entregado: { title: "Mercadito", body: "Tu pedido fue entregado 🎉" },
  cancelado: { title: "Mercadito", body: "Tu pedido fue cancelado" },
};

/** Fire-and-forget push al cliente dueño del pedido cuando cambia el estado. */
async function notificarClientePedido(pedidoId: string, estado: EstadoPedido) {
  const msg = MENSAJE_POR_ESTADO[estado];
  if (!msg) return;
  try {
    const pedido = await queryOne<{ cliente_id: string | null; cliente_telefono: string }>(
      "SELECT cliente_id, cliente_telefono FROM pedidos WHERE id = $1",
      [pedidoId]
    );
    if (!pedido) return;
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
         AND (id = $1 OR telefono = $2)`,
      [pedido.cliente_id, pedido.cliente_telefono]
    );
    const tokens = rows.map((r) => r.push_token);
    enviarPush(tokens, msg.title, msg.body, { pedidoId, tipo: "estado_pedido", estado });
  } catch (e) {
    console.error("[push] notificarClientePedido failed", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { estado, repartidor_id, motivo_cancelacion } = body;

  // Assign repartidor — only repartidores (to themselves) or admin
  if (repartidor_id !== undefined) {
    if (usuario.rol === "repartidor") {
      if (repartidor_id !== null && repartidor_id !== usuario.id) {
        return NextResponse.json({ error: "Solo puedes asignarte a ti mismo" }, { status: 403 });
      }
    } else if (usuario.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (repartidor_id !== null) {
      // Only claim unclaimed orders to prevent race condition
      const result = await query(
        "UPDATE pedidos SET repartidor_id = $1 WHERE id = $2 AND repartidor_id IS NULL RETURNING id",
        [repartidor_id, id]
      );
      if (result.length === 0) {
        return NextResponse.json({ error: "Este pedido ya fue tomado por otro repartidor" }, { status: 409 });
      }
    } else {
      // Allow un-assigning (setting to null)
      await query("UPDATE pedidos SET repartidor_id = $1 WHERE id = $2", [repartidor_id, id]);
    }
    if (!estado) {
      return NextResponse.json({ ok: true });
    }
  }

  if (estado) {
    const validStates = ["pendiente", "en_compra", "en_camino", "entregado", "cancelado"];
    if (!validStates.includes(estado)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    if (estado === "cancelado") {
      const pedido = await queryOne(
        "SELECT id, estado, cliente_id, cliente_telefono FROM pedidos WHERE id = $1",
        [id]
      );
      if (!pedido) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }

      if (usuario.rol === "cliente") {
        // Client can only cancel their own orders in "pendiente"
        const isOwner = pedido.cliente_id === usuario.id || pedido.cliente_telefono === usuario.telefono;
        if (!isOwner) {
          return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
        }
        if (pedido.estado !== "pendiente") {
          return NextResponse.json({ error: "Solo puedes cancelar pedidos que aun no se estan comprando. Llama al repartidor para coordinar." }, { status: 400 });
        }
      } else if (usuario.rol === "repartidor") {
        // Repartidor can cancel in "pendiente" or "en_compra", NOT once en_camino
        if (pedido.estado !== "pendiente" && pedido.estado !== "en_compra") {
          return NextResponse.json({ error: "No se puede cancelar un pedido que ya esta en camino" }, { status: 400 });
        }
      } else if (usuario.rol !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      // Save cancellation with reason
      await query(
        "UPDATE pedidos SET estado = 'cancelado', motivo_cancelacion = $1 WHERE id = $2",
        [motivo_cancelacion || null, id]
      );
      notificarClientePedido(id, "cancelado");
      return NextResponse.json({ ok: true, estado: "cancelado" });

    } else {
      // Non-cancel state changes: only repartidor and admin
      if (usuario.rol !== "repartidor" && usuario.rol !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const result = await query(
        "UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING id",
        [estado, id]
      );
      if (result.length === 0) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }
      notificarClientePedido(id, estado as EstadoPedido);
      return NextResponse.json({ ok: true, estado });
    }
  }

  return NextResponse.json({ ok: true });
}
