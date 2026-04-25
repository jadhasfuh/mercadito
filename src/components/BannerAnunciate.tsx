"use client";

const WA_VENTAS = "5215659163241";
const PRECIO_DESDE = 99;

/**
 * Banner para vender espacios publicitarios. Diseñado para colarse entre
 * secciones del catálogo de /cliente (mucho tráfico, pasa frente a dueños
 * de negocios que también compran). Click → WhatsApp con mensaje
 * pre-llenado al número de ventas.
 *
 * Look: cartel mexicano moderno — fondo crema, borde grueso café,
 * tipografía bold, ilustración SVG sencilla del local. Sin gradientes
 * agresivos para que no compita visualmente con el botón "Pedir ahora"
 * de la landing.
 */
export default function BannerAnunciate() {
  const mensaje = encodeURIComponent(
    "Hola, me interesa anunciar mi negocio en Mercadito. ¿Me cuentan los detalles?"
  );
  return (
    <a
      href={`https://wa.me/${WA_VENTAS}?text=${mensaje}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-cream border-2 border-navy/15 rounded-2xl shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] overflow-hidden my-3"
      style={{ backgroundImage: "linear-gradient(135deg, #FAF6F1 0%, #FEF3E2 100%)" }}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="shrink-0">
          <Local />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="h-px w-4 bg-navy/30" />
            <p className="text-[10px] font-bold tracking-widest text-navy uppercase">
              Para tu negocio
            </p>
            <span className="h-px flex-1 bg-navy/30" />
          </div>
          <h3 className="text-xl font-black text-navy leading-tight tracking-tight">
            ANÚNCIATE AQUÍ
          </h3>
          <p className="text-xs text-navy-light leading-snug mt-1">
            Llega a más clientes de tu zona
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-brand text-white text-[11px] font-black px-3 py-1 rounded-full shadow-sm">
            <span>Desde ${PRECIO_DESDE}</span>
            <span className="opacity-80">/ semana</span>
          </div>
        </div>
        <div className="shrink-0 text-navy/40 text-2xl">›</div>
      </div>
    </a>
  );
}

/**
 * SVG inline de un local comercial estilo "cartelito" — más cálido que
 * un emoji y siempre se ve igual entre dispositivos. Paleta Mercadito.
 */
function Local() {
  return (
    <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden>
      {/* Toldo */}
      <path d="M8 18 L56 18 L52 28 L12 28 Z" fill="#F28C28" />
      <path d="M16 18 L20 28 M24 18 L28 28 M32 18 L36 28 M40 18 L44 28 M48 18 L52 28" stroke="#FAF6F1" strokeWidth="1.2" />
      {/* Edificio */}
      <rect x="12" y="28" width="40" height="28" fill="#FAF6F1" stroke="#92400E" strokeWidth="2" />
      {/* Puerta */}
      <rect x="26" y="36" width="12" height="20" fill="#92400E" />
      <circle cx="35" cy="46" r="0.9" fill="#F28C28" />
      {/* Ventanitas */}
      <rect x="16" y="34" width="6" height="6" fill="#FEF3E2" stroke="#92400E" strokeWidth="1" />
      <rect x="42" y="34" width="6" height="6" fill="#FEF3E2" stroke="#92400E" strokeWidth="1" />
      {/* Letrero */}
      <rect x="20" y="13" width="24" height="5" rx="1" fill="#92400E" />
      <text x="32" y="17" textAnchor="middle" fontSize="3.5" fontWeight="900" fill="#FEF3E2" fontFamily="ui-sans-serif, system-ui">TIENDA</text>
    </svg>
  );
}
