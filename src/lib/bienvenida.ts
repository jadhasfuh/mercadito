import { query, queryOne } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { PRECIO_MENSUAL_TXT, TRIAL_TXT } from "@/lib/plan";
import { ADMIN_TEL_DISPLAY, MERCADITO_TEL_DISPLAY } from "@/lib/contacto";
import { v4 as uuidv4 } from "uuid";

/**
 * Mensajes que Mercadito le manda solo a un negocio, en el hilo de soporte
 * del panel (tabla `mensajes`). No es correo ni WhatsApp: es donde el negocio
 * ya nos escribe cuando tiene dudas, así que la conversación arranca en el
 * mismo lugar donde va a seguir.
 *
 * Son DOS textos distintos, y la diferencia importa:
 *
 *   'bienvenida'   → al negocio que acaba de registrarse. Nunca conoció el
 *                    delivery, así que no tiene sentido anunciarle que se va.
 *   'aviso_cambio' → al negocio que YA estaba cuando Mercadito hacía entregas.
 *                    Aquí sí hay que explicar qué cambia y qué se queda.
 *
 * `mensajes.tipo` guarda cuál se mandó, y es lo que hace idempotente el envío:
 * el botón del panel se puede tocar las veces que sea sin duplicar hilos.
 */

const AYUDA_MENUS =
  `🙋 ¿Tienes muchos productos que subir o actualizar? Mándame al WhatsApp ${ADMIN_TEL_DISPLAY} la foto de tu menú o la lista escrita y yo te los cargo. Sin costo extra.`;

const SUGERENCIAS =
  "💡 Y si algo de la app se te hace complicado, dímelo. Cualquier sugerencia para hacerla más sencilla es bienvenida.";

const REPARTIDOR =
  `🛵 ¿Necesitas repartidor? Por ahora escribe al WhatsApp ${MERCADITO_TEL_DISPLAY} — cubre Sahuayo y Jiquilpan. Esperamos tener más repartidores disponibles pronto.`;

/** Para negocios nuevos: qué es Mercadito y cuál es su siguiente paso. */
export function textoBienvenida(nombreNegocio?: string | null): string {
  const saludo = nombreNegocio ? `¡Bienvenido a Mercadito, ${nombreNegocio}! 🎉` : "¡Bienvenido a Mercadito! 🎉";
  return [
    saludo,
    "",
    "Tu menú digital ya está listo para armarse. Funciona así:",
    "",
    "1️⃣ Sube tus productos con foto y precio. En cuanto cargues el primero, tu menú se publica solo.",
    "2️⃣ Comparte tu link o tu código QR. Tus clientes lo abren sin bajar ninguna app.",
    "3️⃣ Las órdenes te llegan directo a tu WhatsApp y tú las atiendes como siempre.",
    "",
    "No cobramos comisión por lo que vendas.",
    "",
    `🎁 Tienes ${TRIAL_TXT} gratis con todo incluido: menú digital, mesas con QR, cuentas para tus meseros y agenda de reservas. Si después quieres seguir, escríbeme al ${ADMIN_TEL_DISPLAY} y lo vemos (${PRECIO_MENSUAL_TXT} al mes, sin comisiones).`,
    "",
    AYUDA_MENUS,
    "",
    SUGERENCIAS,
    "",
    REPARTIDOR,
    "",
    "Gracias por estar aquí. 🙌",
  ].join("\n");
}

/** Para los negocios que ya estaban: qué cambia y qué se queda. */
export function textoAvisoCambio(nombreNegocio?: string | null): string {
  const saludo = nombreNegocio ? `¡Hola, ${nombreNegocio}! 👋` : "¡Hola! 👋";
  return [
    saludo,
    "",
    "Te cuento un cambio importante, y varias cosas buenas.",
    "",
    "🛵 Mercadito deja de manejar las entregas. Eso es lo único que se va.",
    "",
    "✅ Todo lo demás se queda y sigue creciendo: tu menú digital, tu link y tu código QR, tus fotos y precios, las mesas con QR, las cuentas de tus meseros y la agenda de reservas.",
    "",
    "📲 Ahora las órdenes te llegan directo a tu WhatsApp. Tú las atiendes y cobras como siempre, y nosotros no nos quedamos con ninguna comisión.",
    "",
    `🎁 Tienes ${TRIAL_TXT} gratis desde hoy, con todo incluido. Si después quieres continuar, escríbeme al ${ADMIN_TEL_DISPLAY} y lo vemos (${PRECIO_MENSUAL_TXT} al mes).`,
    "",
    AYUDA_MENUS,
    "",
    SUGERENCIAS,
    "",
    REPARTIDOR,
    "",
    "Gracias por la confianza. 🙌",
  ].join("\n");
}

type TipoMensaje = "bienvenida" | "aviso_cambio";

const PUSH: Record<TipoMensaje, { titulo: string; cuerpo: string }> = {
  bienvenida: {
    titulo: "👋 Bienvenido a Mercadito",
    cuerpo: "Te dejamos en tu panel los pasos para publicar tu menú. Ábrelo cuando puedas.",
  },
  aviso_cambio: {
    titulo: "📣 Un cambio en Mercadito",
    cuerpo: "Te dejamos un mensaje en tu panel con lo que cambia y lo que se queda.",
  },
};

/**
 * Manda un mensaje del sistema a un negocio. Idempotente por `tipo`: si ya
 * tiene uno de ese tipo, no hace nada y devuelve `false`.
 *
 * Best-effort en el push: si falla la notificación, el mensaje ya quedó
 * guardado y el negocio lo ve al entrar.
 */
async function enviarMensajeSistema(puestoId: string, tipo: TipoMensaje): Promise<boolean> {
  if (!puestoId) return false;

  const yaTiene = await queryOne<{ id: string }>(
    "SELECT id FROM mensajes WHERE para_puesto_id = $1 AND tipo = $2 LIMIT 1",
    [puestoId, tipo]
  );
  if (yaTiene) return false;

  const negocio = await queryOne<{ nombre: string }>("SELECT nombre FROM puestos WHERE id = $1", [puestoId]);
  if (!negocio) return false;

  // Se atribuye al primer admin para que el hilo muestre un remitente con
  // nombre. Si no hubiera ninguno, la columna acepta NULL y el mensaje se ve
  // igual (la UI se guía por `de = 'admin'`, no por el nombre).
  const admin = await queryOne<{ id: string }>(
    "SELECT id FROM usuarios WHERE rol = 'admin' AND activo = true ORDER BY created_at LIMIT 1"
  );

  const mensaje = tipo === "bienvenida" ? textoBienvenida(negocio.nombre) : textoAvisoCambio(negocio.nombre);
  const id = uuidv4();
  await query(
    "INSERT INTO mensajes (id, de_usuario_id, para_puesto_id, mensaje, de, tipo) VALUES ($1, $2, $3, $4, 'admin', $5)",
    [id, admin?.id ?? null, puestoId, mensaje, tipo]
  );

  try {
    const dueños = await query<{ id: string; push_token: string | null }>(
      "SELECT id, push_token FROM usuarios WHERE rol = 'tienda' AND activo = true AND puesto_id = $1",
      [puestoId]
    );
    const { titulo, cuerpo } = PUSH[tipo];
    enviarPush(
      dueños.map((u) => u.push_token).filter((t): t is string => !!t),
      titulo, cuerpo, { tipo: "mensaje", mensajeId: id }
    );
    await enviarWebPushAUsuarios(dueños.map((u) => u.id), titulo, cuerpo, { tipo: "mensaje" });
  } catch (e) {
    console.error("[bienvenida] push falló", puestoId, tipo, (e as Error).message);
  }

  return true;
}

/** Bienvenida a un negocio recién registrado. */
export function enviarBienvenida(puestoId: string): Promise<boolean> {
  return enviarMensajeSistema(puestoId, "bienvenida");
}

/**
 * Manda el aviso del cambio a todos los negocios que no lo hayan recibido.
 * Devuelve a cuántos les llegó. Lo usa el botón del panel de admin.
 */
export async function enviarAvisoCambioPendientes(): Promise<{ enviados: number; total: number }> {
  const faltantes = await query<{ id: string }>(
    `SELECT p.id FROM puestos p
      WHERE NOT EXISTS (
        SELECT 1 FROM mensajes m WHERE m.para_puesto_id = p.id AND m.tipo = 'aviso_cambio'
      )
      -- Solo a los que tienen dueño activo: un puesto sin usuario 'tienda'
      -- (el catch-all interno, restos de pruebas) no tiene quién lo lea.
      AND EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.puesto_id = p.id AND u.rol = 'tienda' AND u.activo = true
      )
      ORDER BY p.id`
  );
  let enviados = 0;
  for (const p of faltantes) {
    if (await enviarMensajeSistema(p.id, "aviso_cambio")) enviados++;
  }
  return { enviados, total: faltantes.length };
}
