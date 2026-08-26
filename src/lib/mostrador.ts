/**
 * Piezas compartidas de la venta en mostrador.
 *
 * Una venta de mostrador es una `cuenta` SIN mesa: así entra sola al corte de
 * caja, a las comandas de cocina y al resumen del negocio, en vez de ser un
 * flujo paralelo que después haya que sumar a mano.
 */

export const SERVICIOS = ["local", "llevar", "domicilio"] as const;
export type Servicio = (typeof SERVICIOS)[number];

export const LABEL_SERVICIO: Record<Servicio, string> = {
  local: "Comer aquí",
  llevar: "Para llevar",
  domicilio: "A domicilio",
};

/** Métodos de cobro. 'caja' es como se llama el efectivo en `cuentas`. */
export const METODOS = ["caja", "tarjeta", "transferencia"] as const;
export type Metodo = (typeof METODOS)[number];

export const LABEL_METODO: Record<Metodo, string> = {
  caja: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export interface Pago { metodo: Metodo; monto: number }

/**
 * Normaliza el desglose de pago que manda el cliente.
 *
 * Devuelve null si no es válido. Se exige que la suma cuadre con el total
 * (con un centavo de tolerancia por el redondeo): un cobro donde los pagos no
 * suman el ticket deja el corte de caja mal para siempre, y es más barato
 * rechazarlo aquí que perseguirlo en la noche.
 */
export function normalizarPagos(raw: unknown, total: number): Pago[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) return null;
  const pagos: Pago[] = [];
  for (const p of raw) {
    const metodo = (p as { metodo?: unknown })?.metodo;
    const monto = Number((p as { monto?: unknown })?.monto);
    if (typeof metodo !== "string" || !METODOS.includes(metodo as Metodo)) return null;
    if (!Number.isFinite(monto) || monto <= 0) return null;
    const ya = pagos.find((x) => x.metodo === metodo);
    // Dos renglones del mismo método se suman en vez de rechazarse: es un
    // error de captura inofensivo y el resultado es el mismo.
    if (ya) ya.monto = Math.round((ya.monto + monto) * 100) / 100;
    else pagos.push({ metodo: metodo as Metodo, monto: Math.round(monto * 100) / 100 });
  }
  const suma = pagos.reduce((s, p) => s + p.monto, 0);
  if (Math.abs(suma - total) > 0.01) return null;
  return pagos;
}

/** Método principal de una cuenta: el que aportó más dinero. Es lo que se
 *  guarda en `metodo_pago` para que el código viejo siga funcionando. */
export function metodoPrincipal(pagos: Pago[]): Metodo {
  return pagos.reduce((a, b) => (b.monto > a.monto ? b : a)).metodo;
}
