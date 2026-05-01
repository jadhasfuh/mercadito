// Etiquetas de estado: para envíos algunos cambian porque "Comprando" no
// aplica a un repartidor que va por un paquete. Mantener sincronizado con
// src/lib/estadoPedido.ts del backend.

export type EstadoPedido = "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";
export type TipoPedido = "mercado" | "envio";

export function labelEstado(estado: EstadoPedido, tipo?: TipoPedido | null): string {
  if (tipo === "envio") {
    if (estado === "en_compra") return "Recogiendo";
    if (estado === "en_camino") return "Llevando paquete";
  }
  switch (estado) {
    case "pendiente": return "Pendiente";
    case "en_compra": return "Comprando";
    case "en_camino": return "En camino";
    case "entregado": return "Entregado";
    case "cancelado": return "Cancelado";
  }
}

export function labelEstadoCorto(estado: EstadoPedido, tipo?: TipoPedido | null): string {
  if (tipo === "envio") {
    if (estado === "en_compra") return "Recogiendo";
    if (estado === "en_camino") return "Llevando";
  }
  return labelEstado(estado, tipo);
}

export function siguienteAccionLabel(estado: EstadoPedido, tipo?: TipoPedido | null): string | null {
  if (tipo === "envio") {
    if (estado === "pendiente") return "Ir por el paquete";
    if (estado === "en_compra") return "Salir a entregar";
    if (estado === "en_camino") return "Marcar entregado";
  }
  if (estado === "pendiente") return "Ir a comprar";
  if (estado === "en_compra") return "Salir a entregar";
  if (estado === "en_camino") return "Marcar entregado";
  return null;
}
