import { query, queryOne } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { PRECIO_MENSUAL_TXT, TRIAL_TXT } from "@/lib/plan";
import { v4 as uuidv4 } from "uuid";

/**
 * Mensaje de bienvenida al negocio que se acaba de registrar.
 *
 * Vive en el hilo de mensajes del panel (tabla `mensajes`), no en un correo ni
 * en un WhatsApp: es donde el negocio ya nos escribe cuando tiene dudas, así
 * que la conversación arranca en el mismo lugar donde va a seguir.
 *
 * El texto describe a Mercadito DESPUÉS del pivote de agosto 2026: menús
 * digitales y gestión del negocio. Ya no hay entregas, así que no se promete
 * ninguna: los pedidos salen al WhatsApp del propio negocio.
 */
export function textoBienvenida(nombreNegocio?: string | null): string {
  const saludo = nombreNegocio ? `¡Bienvenido a Mercadito, ${nombreNegocio}! 🎉` : "¡Bienvenido a Mercadito! 🎉";
  return [
    saludo,
    "",
    "Tu menú digital ya está listo para armarse. Funciona así:",
    "",
    "1️⃣ Sube tus productos con foto y precio. En cuanto cargues el primero, tu menú se publica solo.",
    "2️⃣ Comparte tu link o tu código QR. Tus clientes lo abren sin bajar ninguna app.",
    "3️⃣ Los pedidos te llegan directo a tu WhatsApp y tú los atiendes como siempre.",
    "",
    "Tu menú digital es gratis y no cobramos comisión por lo que vendas.",
    "",
    `Si además quieres mesas con QR, cuentas para tus meseros y agenda de reservas, tienes ${TRIAL_TXT} de prueba del plan Premium y después son ${PRECIO_MENSUAL_TXT} al mes.`,
    "",
    "¿Cualquier duda? Contéstanos por aquí mismo, te leemos. 🙌",
  ].join("\n");
}

/** Texto corto del push: el mensaje completo no cabe en una notificación. */
const PUSH_TITULO = "👋 Bienvenido a Mercadito";
const PUSH_CUERPO = "Te dejamos en tu panel los tres pasos para publicar tu menú. Ábrelo cuando puedas.";

/**
 * Manda la bienvenida a un negocio. Idempotente: si ya tiene una, no hace
 * nada y devuelve `false`. Eso es lo que permite correr el backfill las veces
 * que haga falta sin llenarle el hilo a nadie.
 *
 * Best-effort en el push: si falla la notificación, el mensaje ya quedó
 * guardado y el negocio lo ve al entrar.
 */
export async function enviarBienvenida(puestoId: string): Promise<boolean> {
  if (!puestoId) return false;

  const yaTiene = await queryOne<{ id: string }>(
    "SELECT id FROM mensajes WHERE para_puesto_id = $1 AND tipo = 'bienvenida' LIMIT 1",
    [puestoId]
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

  const mensaje = textoBienvenida(negocio.nombre);
  const id = uuidv4();
  await query(
    "INSERT INTO mensajes (id, de_usuario_id, para_puesto_id, mensaje, de, tipo) VALUES ($1, $2, $3, $4, 'admin', 'bienvenida')",
    [id, admin?.id ?? null, puestoId, mensaje]
  );

  try {
    const dueños = await query<{ id: string; push_token: string | null }>(
      "SELECT id, push_token FROM usuarios WHERE rol = 'tienda' AND activo = true AND puesto_id = $1",
      [puestoId]
    );
    enviarPush(
      dueños.map((u) => u.push_token).filter((t): t is string => !!t),
      PUSH_TITULO,
      PUSH_CUERPO,
      { tipo: "mensaje", mensajeId: id }
    );
    await enviarWebPushAUsuarios(dueños.map((u) => u.id), PUSH_TITULO, PUSH_CUERPO, { tipo: "mensaje" });
  } catch (e) {
    console.error("[bienvenida] push falló", puestoId, (e as Error).message);
  }

  return true;
}

/**
 * Manda la bienvenida a todos los negocios que nunca la recibieron.
 * Devuelve a cuántos les llegó. Lo usa el botón del panel de admin.
 */
export async function enviarBienvenidaPendientes(): Promise<{ enviados: number; total: number }> {
  const faltantes = await query<{ id: string }>(
    `SELECT p.id FROM puestos p
      WHERE NOT EXISTS (
        SELECT 1 FROM mensajes m WHERE m.para_puesto_id = p.id AND m.tipo = 'bienvenida'
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
    if (await enviarBienvenida(p.id)) enviados++;
  }
  return { enviados, total: faltantes.length };
}
