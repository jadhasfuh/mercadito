// Espejo de src/lib/flags.ts en web. A diferencia de web —donde es una
// variable de entorno de Railway— aquí es una constante: cambiarla exige
// build nuevo de todas formas, así que una env var solo agregaría una pieza
// que se puede olvidar de configurar.
//
// DELIVERY (ago 2026): Mercadito deja de operar entregas. La app se queda
// como herramienta del negocio (mesas, comandas, reservas, productos) más
// consulta de menús. Los pedidos del menú salen al WhatsApp del negocio.
//
// Para reactivarlo: DELIVERY_ACTIVO = true + build nuevo. Nada se borró —
// carrito, checkout, mandados y la app de repartidor siguen en el repo.
export const DELIVERY_ACTIVO = false;
