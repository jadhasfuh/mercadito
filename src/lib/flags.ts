// Interruptores de producto. Sirven para APAGAR un flujo completo sin borrar
// su código: cuando la operación vuelva, se prende la variable y regresa tal
// como estaba, con sus datos intactos.
//
// DELIVERY (ago 2026): Mercadito deja de operar entregas y se queda como
// plataforma de menús digitales + gestión del negocio (mesas, comandas,
// reservas). Los pedidos del menú salen al WhatsApp de cada negocio en vez de
// pasar por el carrito de Mercadito.
//
// Para reactivarlo: NEXT_PUBLIC_DELIVERY_ACTIVO=true en Railway y redeploy.
// Nada del flujo de delivery se borró — sigue en el repo y en la base.

/** ¿Mercadito opera entregas? Apagado = catálogo, carrito, checkout, mandados
 *  y la app de repartidor quedan fuera de la vista. */
export const DELIVERY_ACTIVO = process.env.NEXT_PUBLIC_DELIVERY_ACTIVO === "true";

/** Rutas que solo tienen sentido con la operación de entregas encendida.
 *  `/tienda/solicitar-repartidor` va aquí y no bajo `/tienda` porque el resto
 *  del panel (menú, mesas, reservas) es justamente lo que se queda. */
export const RUTAS_DELIVERY = ["/cliente", "/repartidor", "/tienda/solicitar-repartidor"];

export function esRutaDelivery(pathname: string): boolean {
  return RUTAS_DELIVERY.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
