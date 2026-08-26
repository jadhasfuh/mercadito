import { ImageResponse } from "next/og";
import { NARANJA, NARANJA_OSCURO, CREMA, TINTA } from "@/lib/tarjeta";

// GET /api/promo/grafico
// Gráfico destacado de Google Play: 1024 × 500 exactos.
//
// Reglas del formato:
//  · Play lo recorta y le encima elementos en distintas superficies, así que
//    nada importante va cerca de los bordes (margen de ~64 px).
//  · Google desaconseja meter capturas o marcos de teléfono: se ven mal al
//    reescalar. Se dibuja todo con cajas y texto.
//  · Sin emojis ni imágenes remotas — ImageResponse las descargaría al
//    renderizar y un fallo dejaría la ficha sin gráfico.
//  · Poco texto: en la ficha se ve a menos de la mitad de este tamaño.
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: NARANJA }}>
        {/* Bloque de texto */}
        <div
          style={{
            display: "flex", flexDirection: "column", justifyContent: "center",
            paddingLeft: 64, paddingRight: 32, width: 600,
          }}
        >
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1 }}>
            mercadito
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#FFF7EB", marginTop: 10, lineHeight: 1.2 }}>
            El menú digital de tu negocio
          </div>
          <div
            style={{
              display: "flex", alignSelf: "flex-start", marginTop: 26,
              backgroundColor: "#FFFFFF", borderRadius: 999, padding: "12px 28px",
            }}
          >
            <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: NARANJA_OSCURO }}>
              Los pedidos llegan a tu WhatsApp
            </div>
          </div>
        </div>

        {/* Carta abstracta: sugiere un menú sin usar una captura real */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              display: "flex", flexDirection: "column", width: 300, height: 372,
              backgroundColor: CREMA, borderRadius: 28, padding: 26,
              boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", width: 116, height: 14, borderRadius: 999, backgroundColor: NARANJA }} />
            {/* Renglones de platillo: texto a la izquierda, precio a la derecha */}
            {[
              { w: 150, p: 44 }, { w: 178, p: 40 }, { w: 132, p: 48 },
              { w: 164, p: 38 }, { w: 144, p: 44 },
            ].map((l, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}
              >
                <div style={{ display: "flex", width: l.w, height: 12, borderRadius: 999, backgroundColor: "#DCD6CE" }} />
                <div style={{ display: "flex", width: l.p, height: 12, borderRadius: 999, backgroundColor: TINTA }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1024, height: 500, headers: { "Cache-Control": "public, max-age=600" } }
  );
}
