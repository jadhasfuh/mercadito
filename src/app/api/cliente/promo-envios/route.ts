import { NextResponse } from "next/server";
import { contarEntregadosCliente, promoEnvioGratisActiva, siguienteEnvioGratis, PROMO_ENVIO_GRATIS } from "@/lib/promos";

// GET /api/cliente/promo-envios?telefono=...
// Devuelve el estado de la promo "envío gratis cada N pedidos" para el
// teléfono dado. Si la promo no está vigente, regresa activa: false.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const telefono = searchParams.get("telefono") || "";
  const activa = promoEnvioGratisActiva();
  if (!activa) {
    return NextResponse.json({ activa: false, cada: PROMO_ENVIO_GRATIS.cada });
  }
  const entregados = await contarEntregadosCliente(telefono);
  const proximoGratis = siguienteEnvioGratis(entregados);
  // Cuántos faltan para el próximo regalo. Si proximoGratis=true, falta 0
  // (este es el premio). Si no, faltan los que restan para llegar al
  // siguiente múltiplo de "cada".
  const faltanParaGratis = proximoGratis
    ? 0
    : (PROMO_ENVIO_GRATIS.cada - (entregados % PROMO_ENVIO_GRATIS.cada));
  return NextResponse.json({
    activa: true,
    cada: PROMO_ENVIO_GRATIS.cada,
    entregados,
    proximo_gratis: proximoGratis,
    faltan_para_gratis: faltanParaGratis,
    termina: PROMO_ENVIO_GRATIS.termina,
  });
}
