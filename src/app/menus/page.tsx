"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import dynamic from "next/dynamic";
import { labelCiudad } from "@/lib/ciudades";
import { porCercania, pedirUbicacion, formatKm, ORIGEN_DEFAULT, RADIO_KM, type Origen } from "@/lib/cercania";
import { useFavoritos } from "@/lib/favoritos";
import Corazon from "@/components/Corazon";
import { avisar } from "@/components/Dialogos";

// Leaflet toca `window` al importarse: sin ssr:false rompe el render del servidor.
const MapaUbicacionTienda = dynamic(() => import("@/components/MapaUbicacionTienda"), { ssr: false });

interface PuestoDir {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  logo: string | null;
  ciudad?: string | null;
  // Coordenadas del negocio: con ellas se calcula la cercanía. Pueden venir
  // nulas en altas viejas (el mapa no siempre fue obligatorio).
  lat?: number | null;
  lng?: number | null;
  aprobado?: boolean;
  menu_publico?: boolean | null;
  menu_slug?: string | null;
  abierto_ahora?: boolean;
  // Derivadas de los productos con precio activo; vacío = tienda sin productos.
  categorias?: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * /menus — directorio de menús digitales. Lista todas las tiendas con menú
 * público y manda a /m/[tienda] (la página de menú con "pedir a domicilio").
 * Es la entrada sin QR: descubrir tiendas → ver menú → precargar carrito.
 */
export default function MenusPage() {
  const [puestos, setPuestos] = useState<PuestoDir[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  // Desde dónde medimos la cercanía. Arranca en Sahuayo y se afina con el GPS
  // (si lo dan) o con el pin que ponga el usuario en el mapa.
  const [origen, setOrigen] = useState<Origen>(ORIGEN_DEFAULT);
  const [pidiendoGps, setPidiendoGps] = useState(false);
  const [abrirMapa, setAbrirMapa] = useState(false);
  const [verLejanos, setVerLejanos] = useState(false);
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const { favoritos, esFavorito, alternar } = useFavoritos();
  // Negocios cuyo MENÚ tiene algo que coincide con la búsqueda. La gente
  // busca "hamburguesa", no el nombre de la taquería, y el nombre del
  // producto no viene en el listado de negocios: se consulta al servidor.
  const [porProducto, setPorProducto] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setPorProducto({}); return; }
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/menus/buscar?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((r: { id: string; coincidencias: string[] }[]) => {
          if (vivo) setPorProducto(Object.fromEntries(r.map((x) => [x.id, x.coincidencias])));
        })
        .catch(() => { if (vivo) setPorProducto({}); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  useEffect(() => {
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((data: PuestoDir[]) => {
        if (!Array.isArray(data)) return;
        // Sin categorías = sin ningún producto activo → no hay menú que mostrar.
        setPuestos(data.filter((p) =>
          p.aprobado !== false && p.menu_publico !== false && (p.categorias?.length ?? 0) > 0
        ));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Al entrar preguntamos la ubicación una vez. Si la niegan seguimos con
  // Sahuayo y el usuario puede mover el pin — nunca queda bloqueado.
  useEffect(() => {
    let vivo = true;
    pedirUbicacion().then((o) => { if (vivo && o) setOrigen(o); });
    return () => { vivo = false; };
  }, []);

  const usarGps = async () => {
    setPidiendoGps(true);
    const o = await pedirUbicacion();
    setPidiendoGps(false);
    if (o) setOrigen(o);
    else avisar({ emoji: "📍", titulo: "No pudimos obtener tu ubicación", mensaje: "Puedes marcarla tú en el mapa." });
  };

  const { cerca, lejos } = useMemo(() => {
    // El filtro de favoritos manda sobre todo lo demás (incluida la
    // distancia): si alguien lo prende quiere SUS negocios, no los de aquí.
    let lista = soloFavoritos ? puestos.filter((p) => favoritos.puestos.includes(p.id)) : puestos;
    // La búsqueda por nombre ignora la distancia: si alguien escribe el
    // nombre exacto de un negocio, quiere ese negocio, esté donde esté.
    if (busqueda.trim()) {
      const q = norm(busqueda);
      // Al nombre del negocio se suman los que VENDEN lo buscado.
      lista = lista.filter(
        (p) => norm(`${p.nombre} ${p.descripcion ?? ""}`).includes(q) || porProducto[p.id] !== undefined
      );
      return { cerca: porCercania(origen, lista), lejos: [] as ReturnType<typeof porCercania<PuestoDir>> };
    }
    const conDistancia = porCercania(origen, lista);
    // Con "solo favoritos" no se esconde nada por lejanía: son pocos y el
    // usuario ya los eligió a mano.
    if (soloFavoritos) return { cerca: conDistancia, lejos: [] as ReturnType<typeof porCercania<PuestoDir>> };
    return {
      cerca: conDistancia.filter((x) => x.cerca),
      lejos: conDistancia.filter((x) => !x.cerca),
    };
  }, [puestos, origen, busqueda, porProducto, soloFavoritos, favoritos.puestos]);

  // Abiertas primero dentro de cada bloque, conservando el orden por cercanía.
  const ordenar = (xs: typeof cerca) =>
    [...xs].sort((a, b) => Number(b.item.abierto_ahora ?? false) - Number(a.item.abierto_ahora ?? false));
  const visibles = ordenar(cerca);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header title="Menús" />
      <main className="flex-1 max-w-lg w-full mx-auto p-3 space-y-3 pb-16">
        {/* Tachita de borrado rápido: borrar letra por letra en el celular es
            la fricción más tonta que puede tener un buscador. */}
        <div className="flex items-center gap-2 w-full bg-white border border-gray-200 rounded-full pl-4 pr-2 py-1.5 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
          <span className="text-gray-400 text-sm leading-none">🔍</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca un negocio o un platillo…"
            aria-label="Buscar negocio o platillo"
            className="flex-1 min-w-0 bg-transparent py-1 text-sm outline-none placeholder:text-gray-400"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label="Limpiar búsqueda"
              className="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center active:scale-90 transition-transform"
            >
              ×
            </button>
          )}
        </div>

        {/* Switch Menús ↔ Reservas: los dos flujos del producto, uno al lado
            del otro. Antes las citas no tenían entrada desde aquí. */}
        <div className="flex bg-gray-100 rounded-full p-1 gap-1">
          <span className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-brand text-white text-sm font-semibold shadow-sm">
            🍽️ Menús
          </span>
          <Link
            href="/cliente/servicios"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-gray-600 text-sm font-semibold transition-soft"
          >
            📅 Reservas
          </Link>
        </div>

        {/* Solo aparece cuando hay algo que filtrar: un chip apagado que nunca
            se puede prender es ruido. */}
        {favoritos.puestos.length > 0 && (
          <button
            onClick={() => setSoloFavoritos((v) => !v)}
            aria-pressed={soloFavoritos}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full border transition-soft ${
              soloFavoritos ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            <Corazon activo size={14} color={soloFavoritos ? "#ffffff" : "#E1306C"} />
            Mis favoritos ({favoritos.puestos.length})
          </button>
        )}

        {/* Dónde estás. Reemplaza a los chips de ciudad: sin entregas, lo que
            importa es la distancia, no el municipio. */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2.5">
          <span className="text-base leading-none">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 leading-tight">
              {origen.fuente === "gps" ? "Cerca de ti" : origen.fuente === "pin" ? "Cerca del punto que marcaste" : "Cerca de Sahuayo"}
            </p>
            <p className="text-[11px] text-gray-400 leading-tight">
              Negocios a menos de {RADIO_KM} km
            </p>
          </div>
          {origen.fuente !== "gps" && (
            <button
              onClick={usarGps}
              disabled={pidiendoGps}
              className="text-[11px] font-bold text-brand-dark bg-brand-light px-2.5 py-1.5 rounded-full disabled:opacity-50"
            >
              {pidiendoGps ? "…" : "Usar mi GPS"}
            </button>
          )}
          <button
            onClick={() => setAbrirMapa(true)}
            className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-full"
          >
            Mapa
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando menús…</div>
        ) : visibles.length === 0 && !(verLejanos && lejos.length > 0) ? (
          // Ojo: la lista cercana puede estar vacía y AUN ASÍ haber que
          // pintar algo — si el usuario tocó "ver más lejos", los lejanos se
          // dibujan en la rama de abajo. Sin este segundo check, el botón
          // prendía el flag y no pasaba nada en pantalla.
          <div className="text-center py-16 px-6">
            <p className="text-gray-400">
              {soloFavoritos
                ? "Ninguno de tus favoritos coincide. Toca el corazón de un negocio para guardarlo aquí."
                : busqueda.trim()
                  ? "No encontramos negocios ni productos con esa palabra."
                  : `Todavía no hay negocios a menos de ${RADIO_KM} km de aquí.`}
            </p>
            {!busqueda.trim() && !soloFavoritos && lejos.length > 0 && (
              <button onClick={() => setVerLejanos(true)} className="mt-3 text-sm font-bold text-brand-dark underline">
                Ver los {lejos.length} negocios más lejanos
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibles.map(({ item: p, km }) => (
              <TarjetaNegocio
                key={p.id}
                p={p}
                km={km}
                vende={porProducto[p.id]}
                favorito={esFavorito("puesto", p.id)}
                onFavorito={() => alternar("puesto", p.id)}
              />
            ))}

            {/* Los de fuera del radio no se esconden: se ofrecen aparte, para
                que nadie pierda un negocio que sí conoce por 2 km de más. */}
            {!busqueda.trim() && lejos.length > 0 && (
              verLejanos ? (
                <>
                  {/* El encabezado y el estilo apagado solo tienen sentido si
                      son la SEGUNDA lista. Si no hay nada cerca, los lejanos
                      son el resultado y se ven como tal. */}
                  {visibles.length > 0 && (
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide pt-3 pb-1">
                      Más lejos de {RADIO_KM} km
                    </p>
                  )}
                  {ordenar(lejos).map(({ item: p, km }) => (
                    <TarjetaNegocio
                      key={p.id}
                      p={p}
                      km={km}
                      atenuada={visibles.length > 0}
                      favorito={esFavorito("puesto", p.id)}
                      onFavorito={() => alternar("puesto", p.id)}
                    />
                  ))}
                </>
              ) : (
                <button
                  onClick={() => setVerLejanos(true)}
                  className="w-full text-center text-sm font-bold text-brand-dark py-3 underline"
                >
                  Ver {lejos.length} negocios más lejos
                </button>
              )
            )}
          </div>
        )}
      </main>

      {/* Selector de punto en el mapa — la salida cuando no hay GPS o el
          usuario quiere ver otra zona. Reusa el mapa del alta de tiendas. */}
      {abrirMapa && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setAbrirMapa(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800">¿Dónde andas?</p>
                <p className="text-[11px] text-gray-400">Toca el mapa para mover el punto</p>
              </div>
              <button onClick={() => setAbrirMapa(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <MapaUbicacionTienda
              ubicacionInicial={{ lat: origen.lat, lng: origen.lng }}
              onUbicacionSeleccionada={(lat, lng) => setOrigen({ lat, lng, fuente: "pin" })}
            />
            <div className="p-4">
              <button
                onClick={() => setAbrirMapa(false)}
                className="w-full bg-brand text-white font-bold py-3 rounded-full active:scale-95 transition-transform"
              >
                Ver negocios aquí
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tarjeta de un negocio en el directorio. `atenuada` = va en el bloque
 *  secundario de "más lejos", debajo de los cercanos. */
function TarjetaNegocio({ p, km, atenuada, vende, favorito, onFavorito }: {
  p: PuestoDir; km: number | null; atenuada?: boolean; vende?: string[];
  favorito?: boolean; onFavorito?: () => void;
}) {
  return (
    <Link
      href={`/m/${p.menu_slug || p.id}`}
      className={
        atenuada
          ? "flex items-center gap-3 bg-white/70 rounded-2xl p-3 ring-1 ring-gray-100"
          : "flex items-center gap-3 bg-white rounded-2xl p-3.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lg)] ring-1 ring-gray-100 transition-soft"
      }
    >
      <div
        className={`rounded-xl bg-brand-light flex items-center justify-center overflow-hidden shrink-0 ${
          atenuada ? "w-11 h-11 text-xl" : "w-14 h-14 text-2xl"
        }`}
      >
        {p.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo} alt={p.nombre} className={atenuada ? "w-11 h-11 object-cover" : "w-14 h-14 object-cover"} />
        ) : (
          "🍽️"
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={atenuada ? "font-semibold text-gray-700 truncate text-sm" : "font-bold text-gray-900 truncate"}>
          {p.nombre}
        </p>
        {/* Al buscar por platillo, decir QUÉ hizo match: si no, el negocio
            aparece y no se entiende por qué. */}
        {vende?.length ? (
          <p className="text-xs text-emerald-700 font-semibold truncate">Vende: {vende.join(", ")}</p>
        ) : !atenuada && p.descripcion ? (
          <p className="text-xs text-gray-500 truncate">{p.descripcion}</p>
        ) : null}
        <p className="text-[11px] text-gray-400 mt-0.5">
          📍 {labelCiudad(p.ciudad)}
          {formatKm(km) && <span className="text-brand-dark font-semibold"> · a {formatKm(km)}</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {!atenuada && (p.abierto_ahora === false ? (
          <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Cerrada</span>
        ) : (
          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Abierta</span>
        ))}
        {/* Dentro de un <Link>: sin preventDefault, guardar el favorito
            navegaría al menú y el usuario perdería la lista. */}
        {onFavorito && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFavorito(); }}
            aria-label={favorito ? `Quitar ${p.nombre} de favoritos` : `Guardar ${p.nombre} en favoritos`}
            aria-pressed={favorito}
            className="w-8 h-8 -my-0.5 rounded-full grid place-items-center active:scale-90 transition-transform"
          >
            <Corazon activo={!!favorito} size={18} />
          </button>
        )}
      </div>
    </Link>
  );
}
