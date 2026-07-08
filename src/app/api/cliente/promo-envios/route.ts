import { NextResponse } from "next/server";
import { contarEntregadosCliente, estadoPromoEnvioGratis, siguienteEnvioGratis, PROMO_ENVIO_GRATIS } from "@/lib/promos";
import { throttle, ipDe } from "@/lib/ratelimit";

// GET /api/cliente/promo-envios?telefono=...
// Estado de la promo "envío gratis cada N pedidos":
//   estado: "vigente" | "proximamente" | "expirada" | "off"
//   cada, inicia, termina y, si hay teléfono, conteo del cliente.
export async function GET(request: Request) {
  // Endpoint público (el banner móvil lo llama sin sesión). Throttle por IP
  // para que el conteo por teléfono no se pueda cosechar masivamente.
  const rl = throttle(`promo:${ipDe(request)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const telefono = searchParams.get("telefono") || "";
  const estado = estadoPromoEnvioGratis();
  const base = {
    activa: estado === "vigente",
    estado,
    cada: PROMO_ENVIO_GRATIS.cada,
    inicia: PROMO_ENVIO_GRATIS.inicia,
    termina: PROMO_ENVIO_GRATIS.termina,
  };
  if (estado === "off" || estado === "expirada") {
    return NextResponse.json(base);
  }
  // proximamente y vigente: incluir conteo si hay teléfono.
  if (!telefono) return NextResponse.json(base);
  const entregados = await contarEntregadosCliente(telefono);
  const proximoGratis = estado === "vigente" && siguienteEnvioGratis(entregados);
  const faltanParaGratis = proximoGratis
    ? 0
    : (PROMO_ENVIO_GRATIS.cada - (entregados % PROMO_ENVIO_GRATIS.cada));
  return NextResponse.json({
    ...base,
    entregados,
    proximo_gratis: proximoGratis,
    faltan_para_gratis: faltanParaGratis,
  });
}
