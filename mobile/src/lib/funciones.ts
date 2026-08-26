/**
 * Catálogo de funciones de Mercadito, con su "cómo se usa" en tres pasos.
 *
 * Es el contenido del centro de ayuda que ve el negocio dentro del panel. Vive
 * aquí y no en el componente porque web y app pintan la MISMA lista: si una
 * función cambia, cambia en los dos lados a la vez.
 *
 * ESPEJO de src/lib/funciones.ts (web). Si se agrega una función, va en los dos.
 */

export type ClaveFuncion = "menu" | "ficha" | "mesas" | "comandas" | "meseros" | "caja" | "reservas";

export interface Funcion {
  clave: ClaveFuncion;
  icono: string;
  titulo: string;
  /** Para qué sirve, en una frase y desde el lado del negocio. */
  para: string;
  /** Cómo se usa. Tres pasos concretos, no conceptos. */
  pasos: [string, string, string];
  /** Qué hacer para prenderla, cuando está sin usar. */
  accion: string;
}

export const FUNCIONES: Funcion[] = [
  {
    clave: "menu",
    icono: "📱",
    titulo: "Menú digital y QR",
    para: "Tu carta en línea, con tus precios y tus fotos. Los pedidos te llegan a tu WhatsApp.",
    pasos: [
      "Carga tus productos con precio en la pestaña Productos.",
      "Comparte tu enlace o pega tu QR en el mostrador y en las mesas.",
      "El cliente arma su pedido y te llega armado por WhatsApp.",
    ],
    accion: "Ir a Productos",
  },
  {
    clave: "ficha",
    icono: "ℹ️",
    titulo: "Ficha de tu negocio",
    para: "Contesta sola las preguntas de siempre: horario, dónde estás, si aceptas tarjeta y si hay para llevar.",
    pasos: [
      "Marca tus formas de pago y de servicio en Mi tienda.",
      "Revisa que tu horario y tu dirección estén al día.",
      "Aparece en tu menú, en el botón de información.",
    ],
    accion: "Configurar en Mi tienda",
  },
  {
    clave: "mesas",
    icono: "🍽️",
    titulo: "QR por mesa",
    para: "Cada mesa con su código. El comensal pide desde su lugar, sin esperar a que alguien lo atienda.",
    pasos: [
      "Da de alta tus mesas en la pestaña Mesas.",
      "Imprime el QR de cada una y pégalo en la mesa.",
      "Lo que pidan entra directo a tu cuenta y a cocina.",
    ],
    accion: "Dar de alta mis mesas",
  },
  {
    clave: "comandas",
    icono: "👨‍🍳",
    titulo: "Comandas a cocina",
    para: "Adiós a los papelitos. Cada pedido aparece en pantalla con su cronómetro y lo que lleva más tiempo va primero.",
    pasos: [
      "Abre Mesas en una tablet o celular en la cocina.",
      "Cada pedido llega solo, con sus extras y sus notas.",
      "Un toque lo marca listo en todas las pantallas a la vez.",
    ],
    accion: "Abrir el tablero de cocina",
  },
  {
    clave: "meseros",
    icono: "🧑‍🍽️",
    titulo: "Cuentas para tus meseros",
    para: "Tu personal toma pedidos y cobra desde su propio celular, sin ver tus precios, tus reportes ni tu suscripción.",
    pasos: [
      "Crea una cuenta por mesero (nombre, teléfono y PIN) en Mesas.",
      "Entran desde mercadito.cx/mesero con su teléfono y su PIN.",
      "Ven sus mesas, toman la orden y cierran la cuenta. Nada más.",
    ],
    accion: "Crear un mesero",
  },
  {
    clave: "caja",
    icono: "💵",
    titulo: "Corte de caja a ciegas",
    para: "Sabes si falta dinero y de qué turno. El cajero cuenta sin ver cuánto debería haber.",
    pasos: [
      "Abre la caja al empezar el turno con el cambio que traes.",
      "Anota cada retiro con su motivo, en el momento.",
      "Al cerrar cuentas el cajón y Mercadito te dice si cuadra.",
    ],
    accion: "Abrir mi caja",
  },
  {
    clave: "reservas",
    icono: "📅",
    titulo: "Reservas y citas",
    para: "Tu agenda en línea, con recordatorios. Para mesas apartadas, servicios o cualquier cita.",
    pasos: [
      "Define tus servicios y su duración en Reservas.",
      "Comparte tu link de reservas por WhatsApp o Instagram.",
      "Te avisamos de cada cita nueva y le recordamos al cliente.",
    ],
    accion: "Configurar mis reservas",
  },
];

export interface EstadoFuncion { activado: boolean; aplica: boolean; extra?: Record<string, unknown> }
export type EstadoFunciones = Partial<Record<ClaveFuncion, EstadoFuncion>>;
