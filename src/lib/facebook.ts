// Publicación en la página de Facebook de Mercadito (Graph API).
//
// Se usa desde el cron `/api/cron/fb-publicar-tiendas` para presentar una
// tienda por día con el QR de su menú digital. Publicamos en NUESTRA propia
// página, no en las de los negocios: por eso basta un token de página y no
// hace falta App Review de Meta.
//
// Config (Railway):
//   FB_PAGE_ID      id numérico de la página
//   FB_PAGE_TOKEN   token de página de larga duración (no lo pongas en el repo)
//   FB_API_VERSION  opcional; la que muestre tu app en el dashboard de Meta
//
// Sin esas variables las funciones son no-op (mismo criterio que web push sin
// VAPID): en local o en un deploy a medio configurar no truena nada.

// Meta va matando versiones viejas: las apps nuevas solo aceptan de v24 en
// adelante. Si algún día v24 también muere, se sube con FB_API_VERSION sin
// tocar código.
const API_VERSION = process.env.FB_API_VERSION || "v24.0";

export function facebookConfigurado(): boolean {
  return !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
}

export interface ResultadoPublicacion {
  ok: boolean;
  post_id?: string;
  error?: string;
}

/**
 * Publica una foto con texto en la página. `imagenUrl` tiene que ser pública:
 * Facebook la descarga desde sus servidores (por eso pasamos la URL de la
 * tarjeta y no los bytes).
 */
export async function publicarFotoEnPagina(
  imagenUrl: string,
  mensaje: string
): Promise<ResultadoPublicacion> {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) {
    return { ok: false, error: "Facebook no configurado (falta FB_PAGE_ID o FB_PAGE_TOKEN)" };
  }

  const body = new URLSearchParams({
    url: imagenUrl,
    message: mensaje,
    published: "true",
    access_token: token,
  });

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string; post_id?: string; error?: { message?: string; code?: number };
    };
    if (!res.ok || data.error) {
      // El mensaje de Meta es lo único accionable (token vencido, versión de
      // API muerta, imagen inalcanzable): lo devolvemos tal cual.
      const msg = data.error?.message || `HTTP ${res.status}`;
      console.error("[facebook] fallo al publicar:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true, post_id: data.post_id || data.id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[facebook] error de red:", msg);
    return { ok: false, error: msg };
  }
}
