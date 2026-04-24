// Datos bancarios para pagos por transferencia SPEI.
// TODO: reemplazar placeholders con la cuenta real antes de lanzar.
export const DATOS_PAGO = {
  banco: "Mercado Pago W",
  clabe: "722969020650490621",
  beneficiario: "Fernando Damian Ceja Renteria",
  cuenta: "",
  concepto: "Pedido Mercadito",
} as const;

export function datosPagoConPedido(pedidoId: string) {
  return {
    ...DATOS_PAGO,
    concepto: `${DATOS_PAGO.concepto} ${pedidoId.slice(0, 8).toUpperCase()}`,
  };
}
