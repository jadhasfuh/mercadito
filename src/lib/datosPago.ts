// Datos bancarios para pagos por transferencia SPEI.
// `dimo` es la misma cuenta vista por número de teléfono (DiMo de Banxico)
// — por debajo es SPEI igual, así que el comprobante y el flujo de
// validación son los mismos que con CLABE.
export const DATOS_PAGO = {
  banco: "Mercado Pago W",
  clabe: "722969020650490621",
  beneficiario: "Fernando Damian Ceja Renteria",
  cuenta: "",
  concepto: "Pedido Mercadito",
  dimo: {
    telefono: "3531539602",
    banco: "Mercado Pago",
    titular: "Fernando Damian Ceja Renteria",
  },
} as const;

export function datosPagoConPedido(pedidoId: string) {
  return {
    ...DATOS_PAGO,
    concepto: `${DATOS_PAGO.concepto} ${pedidoId.slice(0, 8).toUpperCase()}`,
  };
}
