import type { ReactElement } from "react";
import { NARANJA, NARANJA_OSCURO, CREMA, TINTA } from "@/lib/tarjeta";
import { PRECIO_MENSUAL, TRIAL_DIAS } from "@/lib/plan";

// Tarjetas para promocionar MERCADITO (no una tienda). Las publica el cron
// semanal: cada semana toca un ángulo distinto, así el muro no repite el
// mismo argumento y con el tiempo se cuenta el producto completo.
//
// Mismas reglas duras que lib/tarjeta: nada de emojis ni <img> remotas dentro
// del JSX — ImageResponse los descargaría al renderizar y un fallo tumba la
// publicación. Todo se dibuja con cajas y texto.
//
// Y una regla de legibilidad: en el feed esto se ve a ~350px de ancho, así
// que el titular tiene que leerse a esa escala. De ahí los cuerpos grandes y
// un solo mensaje por tarjeta.

const VERDE_WA = "#25D366";

export interface Variante {
  /** Slug estable, para logs y para forzar una en pruebas. */
  id: string;
  /** Kicker de arriba. */
  gancho: string;
  /** Titular. Lo único que se lee de reojo — corto y concreto. */
  titulo: string;
  /** Apoyo del titular, una línea. */
  bajada: string;
  /** 3 puntos, sin emoji (se dibuja un bullet). */
  puntos: string[];
  /** Texto del botón falso. */
  cta: string;
  /** Acento de la tarjeta. */
  color: string;
  /** Texto del post en Facebook. */
  copy: string;
}

const URL_ALTA = "mercadito.cx/tienda/registro";

export const VARIANTES: Variante[] = [
  {
    id: "menu-digital",
    gancho: "PARA TU NEGOCIO",
    titulo: "Tu carta, en el celular de tus clientes",
    bajada: "Cambias un precio y lo ven al instante",
    puntos: [
      "Un link y un código QR para compartir",
      "Se abre sin instalar nada",
      "Fotos, precios y descripciones",
    ],
    cta: "Pruébalo gratis",
    color: NARANJA,
    copy: `📱 ¿Sigues mandando la foto de tu menú por WhatsApp?

Con Mercadito tu carta vive en un link. Cambias un precio y tus clientes lo ven al instante — sin reimprimir, sin volver a mandar la foto.

${TRIAL_DIAS} días gratis, luego $${PRECIO_MENSUAL} al mes. Sin comisiones por venta.

👉 ${URL_ALTA}`,
  },
  {
    id: "pedidos-whatsapp",
    gancho: "PEDIDOS",
    titulo: "Los pedidos te llegan a tu WhatsApp",
    bajada: "Listos, con todo y variantes",
    puntos: [
      "El cliente arma su pedido en tu menú",
      "Te llega el mensaje ya escrito",
      "Tú confirmas, cobras y entregas",
    ],
    cta: "Quiero el mío",
    color: VERDE_WA,
    copy: `💬 Tus clientes ya te piden por WhatsApp. Ahora que te llegue bien escrito.

Con el menú digital de Mercadito el cliente escoge, arma su pedido y te llega el mensaje listo: productos, sabores, extras y total. Tú confirmas y entregas como siempre.

${TRIAL_DIAS} días gratis, luego $${PRECIO_MENSUAL} al mes.

👉 ${URL_ALTA}`,
  },
  {
    id: "mesas-qr",
    gancho: "PARA RESTAURANTES",
    titulo: "Tus clientes piden desde su mesa",
    bajada: "Un QR por mesa y la orden entra a cocina",
    puntos: [
      "La comanda llega directo a la cocina",
      "Cuenta por mesa y ticket para imprimir",
      "Menos vueltas del mesero, menos errores",
    ],
    cta: "Actívalo hoy",
    color: NARANJA_OSCURO,
    copy: `🍽️ Pega un código en cada mesa y deja que tus clientes pidan solos.

La orden entra directo a tu cocina, cada mesa lleva su cuenta y al final imprimes el ticket. Menos vueltas del mesero y menos errores al anotar.

Incluido en Mercadito: ${TRIAL_DIAS} días gratis, luego $${PRECIO_MENSUAL} al mes.

👉 ${URL_ALTA}`,
  },
  {
    id: "reservas",
    gancho: "CITAS Y RESERVAS",
    titulo: "Tu agenda se llena sola",
    bajada: "Peluquerías, consultorios, salones",
    puntos: [
      "El cliente elige día y hora disponible",
      "Recordatorios automáticos antes de la cita",
      "Se acaban los 'se me olvidó'",
    ],
    cta: "Abre tu agenda",
    color: "#1E3A8A",
    copy: `📅 ¿Sigues apuntando las citas en un cuaderno?

Con Mercadito tus clientes ven tus horarios libres y se agendan solos. Y les llega un recordatorio automático antes de su cita, para que no se les olvide.

Para peluquerías, consultorios, salones y quien trabaje con agenda.

${TRIAL_DIAS} días gratis, luego $${PRECIO_MENSUAL} al mes.

👉 ${URL_ALTA}`,
  },
  {
    id: "precio",
    gancho: "SIN LETRAS CHIQUITAS",
    titulo: `$${PRECIO_MENSUAL} al mes. Ya está.`,
    bajada: `${TRIAL_DIAS} días gratis para probarlo`,
    puntos: [
      "Sin comisión por venta ni por reserva",
      "Sin contrato ni permanencia",
      "Todo incluido: menú, mesas y agenda",
    ],
    cta: "Empieza gratis",
    color: "#047857",
    copy: `🏷️ $${PRECIO_MENSUAL} al mes. Sin comisiones, sin contrato, sin letras chiquitas.

No cobramos por venta ni por reserva: lo que vendes es tuyo. La mensualidad cubre el menú digital, los pedidos en mesa y la agenda de citas.

Pruébalo ${TRIAL_DIAS} días gratis. Si no te sirve, no pagas nada.

👉 ${URL_ALTA}`,
  },
  {
    id: "soporte",
    gancho: "NO ESTÁS SOLO",
    titulo: "Te ayudamos a montarlo",
    bajada: "Y a resolver cualquier duda, cuando sea",
    puntos: [
      "Te ayudamos a subir tus productos",
      "Soporte por chat dentro de la app",
      "Hablas con una persona, no con un robot",
    ],
    cta: "Escríbenos",
    color: "#7C3AED",
    copy: `🤝 "Es que no le sé a la tecnología."

No hay problema: te ayudamos a montar tu menú, subir tus productos y dejarlo listo para compartir. Y si después tienes una duda, nos escribes por chat desde la app y te contesta una persona.

${TRIAL_DIAS} días gratis, luego $${PRECIO_MENSUAL} al mes.

👉 ${URL_ALTA}`,
  },
];

/** Variante de la semana. Determinista: la misma semana da la misma tarjeta
 *  (así un reintento del cron no publica algo distinto), y avanza sola. */
export function varianteDeLaSemana(fecha: Date = new Date()): Variante {
  const semana = Math.floor(fecha.getTime() / (7 * 24 * 60 * 60 * 1000));
  return VARIANTES[semana % VARIANTES.length];
}

export function tarjetaPromo(v: Variante): ReactElement {
  // Titulares largos bajan de cuerpo para no partir la tarjeta: Satori no
  // recorta, se desborda.
  const tam = v.titulo.length > 34 ? 68 : v.titulo.length > 24 ? 80 : 92;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: CREMA }}>
      <div style={{ display: "flex", width: "100%", height: 20, backgroundColor: v.color }} />

      <div style={{ display: "flex", flexDirection: "column", padding: "48px 64px 0", flexGrow: 1 }}>
        {/* El bloque de texto se centra en el espacio libre en vez de quedar
            pegado arriba: con titulares cortos, anclarlo arriba dejaba un
            hueco muerto de casi un tercio de la tarjeta. */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", alignSelf: "flex-start", backgroundColor: v.color, borderRadius: 999, padding: "10px 24px" }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#FFFFFF", letterSpacing: 2 }}>
            {v.gancho}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: tam, fontWeight: 800, color: TINTA, lineHeight: 1.08, marginTop: 28 }}>
          {v.titulo}
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#6B7280", marginTop: 16 }}>
          {v.bajada}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 44, gap: 20 }}>
          {v.puntos.map((p) => (
            <div key={p} style={{ display: "flex", alignItems: "center" }}>
              {/* Bullet dibujado, no un emoji: los emojis se descargan. */}
              <div style={{
                display: "flex", width: 16, height: 16, borderRadius: 999,
                backgroundColor: v.color, marginRight: 20, flexShrink: 0,
              }} />
              <div style={{ display: "flex", fontSize: 31, color: "#374151" }}>{p}</div>
            </div>
          ))}
        </div>
        </div>

        <div style={{
          display: "flex", alignSelf: "flex-start", backgroundColor: v.color,
          borderRadius: 999, padding: "20px 48px", marginBottom: 14,
        }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#FFFFFF" }}>{v.cta}</div>
        </div>
        <div style={{ display: "flex", fontSize: 27, color: NARANJA_OSCURO, fontWeight: 600, marginBottom: 40 }}>
          {URL_ALTA}
        </div>
      </div>

      <div style={{
        display: "flex", width: "100%", height: 82, backgroundColor: TINTA,
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ display: "flex", fontSize: 27, color: "#FFFFFF", fontWeight: 700, letterSpacing: 1 }}>
          mercadito · menús digitales para tu negocio
        </div>
      </div>
    </div>
  );
}
