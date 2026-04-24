// Datos bancarios para pagos por transferencia SPEI.
// Mantener sincronizado con /src/lib/datosPago.ts del backend.
// `dimo` apunta a la misma cuenta pero accesible por número de teléfono
// (DiMo / Banxico). El backend no distingue: ambos generan el mismo
// comprobante SPEI y se validan igual.
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
