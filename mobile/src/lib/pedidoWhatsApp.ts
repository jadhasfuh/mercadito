// Pedido del menú digital → WhatsApp del negocio.
//
// Con delivery apagado, Mercadito no procesa el pedido: arma el mensaje y lo
// entrega en el WhatsApp que el negocio registró (puestos.telefono_contacto).
// El negocio confirma, cobra y entrega por su cuenta.
//
// Copia literal de src/lib/pedidoWhatsApp.ts (web): el mensaje que recibe el
// negocio debe ser idéntico venga de donde venga. Si cambia allá, cambia aquí.

/** Tope de caracteres del mensaje. wa.me lo manda por URL y los navegadores
 *  empiezan a truncar arriba de ~2000; nos quedamos con margen para que un
 *  pedido largo no llegue cortado a la mitad de un platillo. */
const MAX_MENSAJE = 1500;

/** Quién pide. Todo opcional: si el cliente entró sin sesión y nunca guardó
 *  dirección, el mensaje sale igual que antes y él la escribe a mano. */
export interface DatosCliente {
  nombre?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface LineaPedido {
  nombre: string;
  cantidad: number;
  precioUnit: number;
  /** Presentación (sabor/tamaño) y extras, ya en texto. */
  detalle?: string;
}

/**
 * Normaliza a formato wa.me: dígitos con lada de país.
 * Los negocios capturan 10 dígitos (353 127 8217) → se antepone 52.
 * México quitó el "1" después del 52 en 2019: `+521…` no conecta.
 * Devuelve null si no hay un número usable — ahí el menú se queda en solo-ver.
 */
export function telefonoWhatsApp(tel: string | null | undefined): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("521") && d.length === 13) d = `52${d.slice(3)}`; // 52 1 ##########
  if (d.length === 10) d = `52${d}`;
  if (!d.startsWith("52") || d.length !== 12) return null;
  return d;
}

/** Mensaje del pedido, en el formato que el negocio va a leer en su celular. */
export function mensajePedido(opts: {
  negocio: string;
  lineas: LineaPedido[];
  total: number;
  urlMenu: string;
  cliente?: DatosCliente;
}): string {
  const { negocio, lineas, total, urlMenu, cliente } = opts;
  const money = (n: number) => `$${n.toFixed(0)}`;

  // Quién pide, en la parte FIJA del mensaje: si el pedido es largo se
  // recortan los productos, nunca los datos de contacto — que es lo que el
  // negocio necesita para poder contestar.
  const datos: string[] = [];
  const nombre = cliente?.nombre?.trim();
  const tel = cliente?.telefono?.trim();
  const dir = cliente?.direccion?.trim();
  if (nombre || tel) datos.push(`Soy *${nombre || "un cliente"}*${tel ? ` — ${tel}` : ""}`);
  if (dir) datos.push(`📍 ${dir}`);

  const items = lineas.map((l) => {
    const detalle = l.detalle ? ` (${l.detalle})` : "";
    return `• ${l.cantidad}× ${l.nombre}${detalle} — ${money(l.precioUnit * l.cantidad)}`;
  });

  const armar = (its: string[], nota = "") =>
    [
      `Hola *${negocio}*, quiero hacer este pedido:`,
      "",
      ...its,
      ...(nota ? [nota] : []),
      "",
      `*Total aproximado: ${money(total)}*`,
      ...(datos.length ? ["", ...datos] : []),
      "",
      `Enviado desde ${urlMenu}`,
    ].join("\n");

  let msg = armar(items);
  // Pedido largo: recortamos la lista antes que mandar un mensaje truncado
  // por el navegador. El negocio confirma el resto por chat.
  if (msg.length > MAX_MENSAJE) {
    let n = items.length;
    while (n > 1 && armar(items.slice(0, n), `…y ${items.length - n} producto(s) más (te los digo por aquí)`).length > MAX_MENSAJE) {
      n--;
    }
    msg = armar(items.slice(0, n), `…y ${items.length - n} producto(s) más (te los digo por aquí)`);
  }
  return msg;
}

/**
 * Link para llamar al negocio. Es la salida cuando su número resultó ser fijo
 * o simplemente no tiene WhatsApp: no hay forma confiable de detectarlo desde
 * aquí (Meta no expone validación de números y en México un fijo y un celular
 * se ven igual), así que en vez de adivinar ofrecemos las dos vías y que el
 * cliente use la que le funcione.
 */
export function linkLlamada(tel: string | null | undefined): string | null {
  const d = telefonoWhatsApp(tel);
  return d ? `tel:+${d}` : null;
}

/** Link listo para abrir. null si el negocio no tiene WhatsApp utilizable. */
export function linkPedidoWhatsApp(opts: {
  telefono: string | null | undefined;
  negocio: string;
  lineas: LineaPedido[];
  total: number;
  urlMenu: string;
  cliente?: DatosCliente;
}): string | null {
  const tel = telefonoWhatsApp(opts.telefono);
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensajePedido(opts))}`;
}
