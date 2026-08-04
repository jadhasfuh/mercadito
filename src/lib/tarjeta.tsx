import type { ReactElement } from "react";

// Tarjeta cuadrada de una tienda para redes (la publica el cron de Facebook).
// Dos variantes según haya foto o no:
//   - con foto: comida arriba (55%), datos + QR abajo. Es la que engancha.
//   - sin foto: bloque de marca con las categorías del menú y QR grande.
// Reglas duras del formato: nada de emojis ni de <img> remotas dentro del JSX
// (ImageResponse los descargaría al renderizar y un fallo tumba la
// publicación). Las fotos entran ya resueltas como data URI.

export const NARANJA = "#ED8E3C";
export const NARANJA_OSCURO = "#B3560D";
export const CREMA = "#FCFBFA";
export const TINTA = "#1F2937";
export const TARJETA = { width: 1080, height: 1080 };

export interface DatosTarjeta {
  nombre: string;
  /** Colonia o zona, ya recortada — no la dirección completa. */
  colonia: string | null;
  ciudad: string;
  /** Ruta pública del menú: mercadito.cx/m/{ref} */
  ref: string;
  /** QR del menú como data URI. */
  qr: string;
  /** Foto de comida como data URI, o null si no hubo una utilizable. */
  foto: string | null;
  /** Grupos del menú ("Chilaquiles", "Bowls"), máx 3. */
  categorias: string[];
}

/** Descarga una imagen y la vuelve data URI. null si tarda, pesa de más o no
 *  es imagen: la tarjeta se arma igual sin foto, nunca falla por esto. */
export async function cargarImagenSegura(src: string | null): Promise<string | null> {
  if (!src) return null;
  const MAX = 900_000; // ~900 KB; arriba de eso el render se vuelve lento
  if (src.startsWith("data:")) {
    if (!src.startsWith("data:image/") || src.length > MAX) return null;
    // Los placeholders SVG generados (fondo + iniciales) no son una foto.
    if (src.startsWith("data:image/svg+xml") && src.length < 1200) return null;
    return src;
  }
  const url = src.startsWith("http") ? src : `https://mercadito.cx${src.startsWith("/") ? "" : "/"}${src}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") || "";
    if (!tipo.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX) return null;
    return `data:${tipo};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export function tarjetaTienda(d: DatosTarjeta): ReactElement {
  // "Llanos de Sahuayo, Sahuayo" se lee redundante: si la colonia ya nombra la
  // ciudad, con la colonia basta.
  const repiteCiudad = !!d.colonia && d.colonia.toLowerCase().includes(d.ciudad.toLowerCase());
  const zona = repiteCiudad ? d.colonia! : [d.colonia, d.ciudad].filter(Boolean).join(", ");
  // Nombres largos: bajar el cuerpo para que no parta la tarjeta.
  const tamNombre = d.nombre.length > 30 ? 54 : d.nombre.length > 20 ? 66 : 78;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: CREMA }}>
      {d.foto ? (
        // ---------- Variante con foto: comida primero ----------
        <div style={{ display: "flex", position: "relative", width: "100%", height: 600 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.foto} width={1080} height={600} alt="" style={{ objectFit: "cover" }} />
          <div
            style={{
              position: "absolute", top: 36, left: 36, display: "flex",
              backgroundColor: NARANJA, borderRadius: 999, padding: "12px 26px",
            }}
          >
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#FFFFFF", letterSpacing: 1 }}>
              NUEVO EN MERCADITO
            </div>
          </div>
        </div>
      ) : (
        // ---------- Variante sin foto: marca + lo que vende ----------
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            width: "100%", height: 360, backgroundColor: NARANJA, padding: "0 60px",
          }}
        >
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#FFFFFF", letterSpacing: 3, opacity: 0.9 }}>
            NUEVO EN MERCADITO
          </div>
          {d.categorias.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", marginTop: 22 }}>
              {d.categorias.map((c) => (
                <div
                  key={c}
                  style={{
                    display: "flex", backgroundColor: "#FFFFFF", borderRadius: 999,
                    padding: "12px 28px", margin: 8,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: NARANJA_OSCURO }}>{c}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Bloque de datos + QR ---------- */}
      <div style={{ display: "flex", flexGrow: 1, padding: "40px 56px", alignItems: "center" }}>
        {/* Anchos fijos: con flexGrow el texto largo empujaba el QR fuera del
            lienzo (Satori no recorta, se sale). */}
        <div style={{ display: "flex", flexDirection: "column", width: 620, paddingRight: 36 }}>
          <div style={{ display: "flex", fontSize: tamNombre, fontWeight: 800, color: TINTA, lineHeight: 1.05 }}>
            {d.nombre}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#6B7280", marginTop: 14 }}>
            Pide a domicilio{zona ? ` en ${zona}` : ""}
          </div>
          <div
            style={{
              display: "flex", marginTop: 28, backgroundColor: NARANJA, borderRadius: 999,
              padding: "16px 36px", alignSelf: "flex-start",
            }}
          >
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: "#FFFFFF" }}>Ordena ahora</div>
          </div>
          <div style={{ display: "flex", fontSize: 27, color: NARANJA_OSCURO, fontWeight: 600, marginTop: 18 }}>
            mercadito.cx/m/{d.ref}
          </div>
        </div>

        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0,
            padding: 18, backgroundColor: "#FFFFFF", borderRadius: 28, border: `3px solid ${NARANJA}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.qr} width={240} height={240} alt="" />
          <div style={{ display: "flex", fontSize: 20, color: "#6B7280", marginTop: 8 }}>Escanea el código</div>
        </div>
      </div>

      <div
        style={{
          display: "flex", width: "100%", height: 68, backgroundColor: TINTA,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 25, color: "#FFFFFF", fontWeight: 700, letterSpacing: 1 }}>
          mercadito · tu mercado a domicilio
        </div>
      </div>
    </div>
  );
}
