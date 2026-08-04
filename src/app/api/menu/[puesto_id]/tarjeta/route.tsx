import { queryOne } from "@/lib/db";
import QRCode from "qrcode";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

const BASE_URL = "https://mercadito.cx";
const NARANJA = "#ED8E3C";
const CREMA = "#FCFBFA";

// GET /api/menu/[puesto_id]/tarjeta
// PNG cuadrado (1080×1080) para redes: nombre de la tienda, QR grande del menú
// y el link. Es lo que publica el cron de Facebook — Meta descarga esta URL,
// así que tiene que ser pública y no fallar nunca (por eso no cargamos el logo
// remoto: si la imagen del negocio no responde, se cae el render entero).
export async function GET(req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;

  const puesto = await queryOne<{ nombre: string; ubicacion: string | null; menu_slug: string | null }>(
    "SELECT nombre, ubicacion, menu_slug FROM puestos WHERE id = $1 AND activo = true AND aprobado = true",
    [puesto_id]
  );
  if (!puesto) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  const ref = puesto.menu_slug || puesto_id;
  const url = `${BASE_URL}/m/${ref}`;
  const qr = await QRCode.toDataURL(url, { width: 560, margin: 1, errorCorrectionLevel: "M" });

  // Nombres largos: bajamos el tamaño para que no se coma la tarjeta.
  const tamNombre = puesto.nombre.length > 26 ? 56 : puesto.nombre.length > 18 ? 68 : 82;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", backgroundColor: CREMA,
        }}
      >
        {/* Barra de marca */}
        <div style={{ display: "flex", width: "100%", height: 18, backgroundColor: NARANJA }} />

        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "44px 60px 0", width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 30, color: NARANJA, fontWeight: 700, letterSpacing: 2 }}>
            YA ESTÁ EN MERCADITO
          </div>
          <div
            style={{
              display: "flex", fontSize: tamNombre, fontWeight: 800, color: "#1F2937",
              marginTop: 14, textAlign: "center", lineHeight: 1.1,
            }}
          >
            {puesto.nombre}
          </div>
          {/* Sin emojis dentro de la imagen: ImageResponse los descarga de un
              CDN al renderizar y un fallo ahí tumbaría la publicación. */}
          {puesto.ubicacion ? (
            <div style={{ display: "flex", fontSize: 30, color: "#6B7280", marginTop: 10 }}>
              {puesto.ubicacion}
            </div>
          ) : null}
        </div>

        {/* QR sobre tarjeta blanca */}
        <div
          style={{
            display: "flex", marginTop: 34, padding: 26, backgroundColor: "#FFFFFF",
            borderRadius: 36, border: `4px solid ${NARANJA}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={430} height={430} alt="" />
        </div>

        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#1F2937", marginTop: 26 }}>
          Escanea y pide a domicilio
        </div>
        <div style={{ display: "flex", fontSize: 30, color: NARANJA, fontWeight: 600, marginTop: 8 }}>
          mercadito.cx/m/{ref}
        </div>

        {/* Empuja el pie hasta abajo para que la tarjeta no quede coja. */}
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div
          style={{
            display: "flex", width: "100%", height: 76, backgroundColor: NARANJA,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, color: "#FFFFFF", fontWeight: 700, letterSpacing: 1 }}>
            MERCADITO · tu mercado a domicilio
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
