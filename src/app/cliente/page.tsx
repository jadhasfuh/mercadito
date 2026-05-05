"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import { useSession } from "@/components/SessionProvider";
import type { Categoria, ProductoConPrecios, ItemCarrito, PedidoConItems } from "@/lib/types";
import { getHorarioInfo } from "@/lib/horario";
import { calcularComision } from "@/lib/comision";
import { unidadFormato } from "@/lib/categorias";
import { datosPagoConPedido } from "@/lib/datosPago";
import { claveItemCarrito, sumarExtrasDeVariante, type SeleccionModificador, type ProductoVariante } from "@/lib/variantes";
import ProductoVarianteModal from "@/components/ProductoVarianteModal";
import EditorPedido from "@/components/EditorPedido";
import TicketPedido from "@/components/TicketPedido";
import SearchBar, { matchProducto } from "@/components/SearchBar";
import BannerAnunciate from "@/components/BannerAnunciate";
import BannerProductoDestacado from "@/components/BannerProductoDestacado";
import CalificarRepartidor from "@/components/CalificarRepartidor";
import PinManager from "@/components/PinManager";
import PinInput from "@/components/PinInput";
import { esTelefonoValido, esPinValido, TELEFONO_MENSAJE, PIN_MENSAJE } from "@/lib/validators";
import EnvioModal from "@/components/EnvioModal";
import NotificationBanner from "@/components/NotificationBanner";
import ProductCardCompacta from "@/components/ProductCardCompacta";
import BottomSheet from "@/components/BottomSheet";
import { labelEstado } from "@/lib/estadoPedido";
import { haversineKm } from "@/lib/geo";
import { showNotification, playBeep } from "@/lib/notifications";

const MapaEntrega = dynamic(() => import("@/components/MapaEntrega"), { ssr: false });
const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

type Tab = "comprar" | "carrito" | "entregar" | "pedidos";

function ClienteLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { login } = useSession();
  const [loginNombre, setLoginNombre] = useState("");
  const [loginTelefono, setLoginTelefono] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginPin2, setLoginPin2] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // Lookup automático cuando el teléfono tiene 10 dígitos: nos dice si es
  // cliente nuevo (pedir nombre + PIN opcional) o existente (saludarlo y
  // pedir PIN si lo configuró previamente).
  const [lookup, setLookup] = useState<{ existe: boolean; tiene_pin: boolean; nombre?: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    const tel = loginTelefono.replace(/\D/g, "");
    if (tel.length < 10) {
      setLookup(null);
      return;
    }
    let cancel = false;
    setLookupLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/cliente-existe?telefono=${tel}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancel) setLookup(data);
      } catch {
        // Silencioso: si falla, el form sigue funcionando con el flujo viejo.
      } finally {
        if (!cancel) setLookupLoading(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [loginTelefono]);

  // Estados visuales derivados del lookup.
  const esClienteNuevo = lookup?.existe === false;
  const esClienteConPin = lookup?.existe === true && lookup.tiene_pin === true;
  const esClienteSinPin = lookup?.existe === true && lookup.tiene_pin === false;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const tel = loginTelefono.replace(/\D/g, "");
    if (!esTelefonoValido(tel)) {
      setLoginError(TELEFONO_MENSAJE);
      return;
    }
    if (esClienteNuevo && !loginNombre.trim()) {
      setLoginError("Necesitamos tu nombre para crear tu cuenta");
      return;
    }
    // PIN obligatorio en todos los flujos: existente con PIN, existente sin
    // PIN (lo va a crear ahora), o nuevo (lo crea ahora).
    if (!esPinValido(loginPin)) {
      setLoginError(PIN_MENSAJE);
      return;
    }
    // Si va a crear PIN (nuevo o existente sin PIN), exigimos confirmación
    // — evita que se trabe con un PIN tipeado mal en la primera vez.
    if (!esClienteConPin && loginPin !== loginPin2) {
      setLoginError("Los PINs no coinciden");
      return;
    }
    setLoginError("");
    setLoginLoading(true);
    const result = await login("cliente", {
      nombre: esClienteNuevo ? loginNombre : (lookup?.nombre ?? loginNombre),
      telefono: loginTelefono,
      pin: loginPin,
    });
    if (result.ok) {
      onLoggedIn();
    } else {
      setLoginError(result.error || "Error al entrar");
    }
    setLoginLoading(false);
  }

  return (
    <div className="py-6">
      <div className="text-center mb-6">
        <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
        <h2 className="text-xl font-bold text-gray-800">Ver mis pedidos</h2>
        <p className="text-sm text-gray-400 mt-1">
          {esClienteConPin && lookup?.nombre
            ? `Hola ${lookup.nombre.split(" ")[0]}, escribe tu PIN`
            : esClienteSinPin && lookup?.nombre
              ? `Bienvenido de vuelta, ${lookup.nombre.split(" ")[0]}`
              : esClienteNuevo
                ? "Es tu primera vez. Cuéntanos tu nombre"
                : "Ingresa tu teléfono para entrar o crear cuenta"}
        </p>
      </div>
      <form onSubmit={handleLogin} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Tu teléfono</label>
          <div className="relative">
            <input
              type="tel"
              inputMode="numeric"
              value={loginTelefono}
              onChange={(e) => setLoginTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Tu número a 10 dígitos"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
              autoFocus
            />
            {lookupLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
            )}
          </div>
        </div>

        {/* Nombre solo se pide a clientes nuevos. */}
        {esClienteNuevo && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tu nombre</label>
            <input
              type="text"
              value={loginNombre}
              onChange={(e) => setLoginNombre(e.target.value)}
              placeholder="Cómo te llamas"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
            />
          </div>
        )}

        {/* PIN obligatorio en todos los flujos. Si es cliente con PIN, solo
            pedimos uno (el actual). Si es nuevo o existente sin PIN, pedimos
            el PIN nuevo + confirmación. */}
        {(esClienteConPin || esClienteSinPin || esClienteNuevo) && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1 text-center">
                🔒 {esClienteConPin ? "Tu PIN de 6 dígitos" : "Crea tu PIN de 6 dígitos"}
              </label>
              <PinInput value={loginPin} onChange={setLoginPin} length={6} />
            </div>
            {!esClienteConPin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 text-center">Confirma tu PIN</label>
                  <PinInput
                    value={loginPin2}
                    onChange={setLoginPin2}
                    length={6}
                    error={loginPin2.length === loginPin.length && loginPin2 !== loginPin}
                  />
                </div>
                <p className="text-[11px] text-gray-400 text-center">
                  El PIN protege tus pedidos. Guárdalo bien — si lo olvidas, contacta soporte por WhatsApp.
                </p>
              </>
            )}
          </div>
        )}

        {loginError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
            {loginError}
          </div>
        )}
        <button
          type="submit"
          disabled={loginLoading || !lookup}
          className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
        >
          {loginLoading ? "Entrando..." : "Ver mis pedidos"}
        </button>
        {esClienteConPin && (
          <a
            href={`https://wa.me/5215659163241?text=${encodeURIComponent(`Hola, olvidé mi PIN de Mercadito. Mi teléfono es ${loginTelefono || "[escribe tu teléfono]"}. ¿Pueden resetearlo?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-brand-dark font-medium underline mt-1"
          >
            ¿Olvidaste tu PIN? Escríbenos por WhatsApp
          </a>
        )}
        <p className="text-xs text-gray-400 text-center">
          Usa el mismo teléfono con el que hiciste tu pedido
        </p>
      </form>
    </div>
  );
}

const CATEGORIAS_INFO: Record<string, { nombre: string; icono: string }> = {
  frutas: { nombre: "Frutas", icono: "🍎" },
  verduras: { nombre: "Verduras", icono: "🥬" },
  carnes: { nombre: "Carnes y Mariscos", icono: "🥩" },
  lacteos: { nombre: "Lácteos", icono: "🧀" },
  cremeria: { nombre: "Cremería", icono: "🧈" },
  abarrotes: { nombre: "Abarrotes", icono: "🛒" },
  granos: { nombre: "Granos", icono: "🌾" },
  restaurante: { nombre: "Restaurante", icono: "🍽️" },
  botanero: { nombre: "Centro Botanero", icono: "🍻" },
  cafeteria: { nombre: "Cafetería", icono: "☕" },
  comidas: { nombre: "Comidas", icono: "🍲" },
  antojitos: { nombre: "Antojitos", icono: "🌮" },
  panaderia: { nombre: "Panadería", icono: "🍞" },
  bebidas: { nombre: "Bebidas", icono: "🥤" },
  farmacia: { nombre: "Farmacia", icono: "💊" },
  limpieza: { nombre: "Limpieza", icono: "🧹" },
  mascotas: { nombre: "Mascotas", icono: "🐾" },
  ropa: { nombre: "Ropa", icono: "👕" },
  calzado: { nombre: "Calzado", icono: "👟" },
  otro: { nombre: "Otro", icono: "📦" },
};

export default function ClientePage() {
  const { usuario, login, logout } = useSession();
  const [tab, setTab] = useState<Tab>("comprar");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [tiendaFiltro, setTiendaFiltro] = useState<string | null>(null);
  const [seccionFiltro, setSeccionFiltro] = useState<string | null>(null);
  const [subseccionFiltro, setSubseccionFiltro] = useState<string | null>(null);
  // Filtro de orden. "tiempo"/"distancia" requieren puesto_lead_time_dias y
  // ubicacion del cliente respectivamente — si no hay ubicación, el modal
  // deshabilita la opción distancia. "mayoreo" se separó: ahora es filtro
  // (soloMayoreo) en lugar de orden.
  const [ordenFiltro, setOrdenFiltro] = useState<"default" | "menor" | "mayor" | "tiempo" | "distancia">("default");
  // Toggle "solo tiendas abiertas ahora" — independiente del orden. Cuando
  // está activo, ocultamos precios con cerrada=true (y si un producto se
  // queda sin precios, no aparece).
  const [soloAbiertas, setSoloAbiertas] = useState(false);
  // Solo productos de entrega inmediata (lead_time = 0). Útil para "lo
  // necesito ahora" — esconde productos sobre pedido sin tener que abrir
  // un sheet completo de filtros.
  const [soloInmediato, setSoloInmediato] = useState(false);
  // Solo productos con precio de mayoreo (precio_mayoreo != null). Recorta
  // la lista — ya no reordena, así que respeta el orden elegido por el
  // cliente. Vive en el sheet de Filtros (no en Ordenar).
  const [soloMayoreo, setSoloMayoreo] = useState(false);
  const [sheetOrdenar, setSheetOrdenar] = useState(false);
  const [sheetFiltros, setSheetFiltros] = useState(false);
  const [sheetCategorias, setSheetCategorias] = useState(false);

  // Búsqueda por nombre. Independiente de los demás filtros para que persista
  // al cambiar tienda/categoría/sección — si el cliente buscó "tortilla", el
  // filtro lo sigue mientras explora.
  const [busqueda, setBusqueda] = useState("");
  const [tiendasCategoria, setTiendasCategoria] = useState<{ id: string; nombre: string; ubicacion: string | null; lat: number | null; lng: number | null; logo: string | null; categorias: string[]; abierto_ahora?: boolean; horario_atencion?: { dia_semana: number; abre: string | null; cierra: string | null }[] }[]>([]);
  const [todosProductos, setTodosProductos] = useState<ProductoConPrecios[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [loading, setLoading] = useState(true);
  const [anuncios, setAnuncios] = useState<{ id: string; titulo: string; mensaje: string; imagen?: string | null; link?: string | null }[]>([]);
  const [mostrarEnvio, setMostrarEnvio] = useState(false);

  // Checkout — pre-fill from session if available
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [numeroCasa, setNumeroCasa] = useState("");
  const [notas, setNotas] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [zonaEnvio, setZonaEnvio] = useState("");
  const [tiempoEnvio, setTiempoEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobantePago, setComprobantePago] = useState<string | null>(null);
  // Cuándo quiere recibir el pedido. `null` = "ahora" (inmediato si las
  // tiendas están abiertas). Si el carrito tiene tiendas cerradas, la UI
  // obliga a elegir una ventana futura — esa ventana viene del endpoint
  // /api/puestos/ventanas-comunes que calcula intersección de horarios.
  const [agendadoIso, setAgendadoIso] = useState<string | null>(null);
  const [ventanasOpciones, setVentanasOpciones] = useState<{ inicio: string; fin: string; label: string }[]>([]);
  const [ahoraDisponible, setAhoraDisponible] = useState<boolean>(true);
  const [clabeCopiada, setClabeCopiada] = useState(false);
  const [dimoCopiado, setDimoCopiado] = useState(false);
  // Selector de variante/modificadores (para productos que los tienen).
  const [varianteModal, setVarianteModal] = useState<{
    producto: ProductoConPrecios;
    precio: ProductoConPrecios["precios"][number];
  } | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<string | null>(null);
  const [misPedidos, setMisPedidos] = useState<PedidoConItems[]>([]);

  // Categorías ordenadas por relevancia para este cliente:
  //   1) categorías donde el cliente YA compró (frecuencia descendente),
  //   2) categorías con producto activo,
  //   3) resto (puede ser categoría vacía).
  // Personalización pasiva — sin pedirle nada al cliente, su propio
  // historial decide qué ve primero.
  const categoriasOrdenadas = useMemo(() => {
    const conProducto = new Set(todosProductos.map((p) => p.categoria_id));
    const frecuencia = new Map<string, number>();
    for (const pedido of misPedidos) {
      if (pedido.estado !== "entregado") continue;
      for (const item of pedido.items) {
        const prod = todosProductos.find((p) => p.id === item.producto_id);
        if (!prod) continue;
        frecuencia.set(prod.categoria_id, (frecuencia.get(prod.categoria_id) ?? 0) + 1);
      }
    }
    return [...categorias].sort((a, b) => {
      const fa = frecuencia.get(a.id) ?? 0;
      const fb = frecuencia.get(b.id) ?? 0;
      if (fa !== fb) return fb - fa;
      const pa = conProducto.has(a.id) ? 0 : 1;
      const pb = conProducto.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.orden ?? 0) - (b.orden ?? 0);
    });
  }, [categorias, todosProductos, misPedidos]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const [ticketPedido, setTicketPedido] = useState<string | null>(null);
  const [showPinManager, setShowPinManager] = useState(false);
  const [cambiosPrecio, setCambiosPrecio] = useState<{ producto: string; tienda: string; antes: number; ahora: number; diff: number }[] | null>(null);
  const prevEstadosPedidos = useRef<Record<string, string>>({});
  // Reset del scroll del slider de tiendas cuando cambia categoría/sección.
  // Sin esto, si el cliente scrollea las tiendas y cambia de sección, el
  // slider queda a medio camino y se ve raro si la nueva sección tiene pocas.
  const sliderTiendasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sliderTiendasRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [categoriaActual, seccionFiltro]);

  // Cuando cambia tienda / sección / subsección dentro de una categoría,
  // saltar al inicio de la página para que el cliente vea los productos
  // del nuevo filtro desde el principio (si no, queda mirando la mitad
  // del catálogo viejo).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [tiendaFiltro, seccionFiltro, subseccionFiltro, categoriaActual]);
  const [nuevoSubtotal, setNuevoSubtotal] = useState(0);

  useEffect(() => {
    fetchProductos();
    fetch("/api/anuncios?tipo=clientes").then((r) => r.json()).then(setAnuncios).catch(() => {});
  }, []);

  // Header dispara este evento cuando el cliente toca "Iniciar sesión".
  // Saltamos al tab de pedidos donde vive el form de login (lookup por
  // teléfono → pide PIN si lo tiene).
  useEffect(() => {
    function abrir() { setTab("pedidos"); }
    window.addEventListener("mercadito:abrir-login", abrir);
    return () => window.removeEventListener("mercadito:abrir-login", abrir);
  }, []);

  // Si entran con `?tab=pedidos` (típico del link "Iniciar sesión" del
  // header desde otra página), saltamos directo a esa pestaña.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "pedidos" || t === "carrito" || t === "entregar" || t === "comprar") {
      setTab(t as Tab);
    }
  }, []);

  // Pre-fill from session
  useEffect(() => {
    if (usuario && usuario.rol === "cliente") {
      if (!nombre) setNombre(usuario.nombre);
      if (!telefono) setTelefono(usuario.telefono);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  // Pre-fill desde el último pedido confirmado: dirección, número de casa,
  // ubicación y notas. Guardado en localStorage cuando se confirma pedido.
  // Persiste entre sesiones del navegador y evita que el cliente reescriba
  // su dirección cada vez. Si abre desde otro dispositivo no aplica (sería
  // ideal moverlo a DB en el perfil del usuario, queda como TODO).
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("mercadito_cliente_perfil") : null;
      if (!raw) return;
      const perfil = JSON.parse(raw) as {
        direccion?: string;
        numeroCasa?: string;
        notas?: string;
        ubicacion?: { lat: number; lng: number };
      };
      if (perfil.direccion && !direccion) setDireccion(perfil.direccion);
      if (perfil.numeroCasa && !numeroCasa) setNumeroCasa(perfil.numeroCasa);
      if (perfil.notas && !notas) setNotas(perfil.notas);
      if (perfil.ubicacion && !ubicacion) setUbicacion(perfil.ubicacion);
    } catch {
      // Si el JSON está corrupto, ignoramos.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProductos() {
    setLoading(true);
    const res = await fetch("/api/productos?visible_solo=true");
    const data: ProductoConPrecios[] = await res.json();
    setTodosProductos(data);

    // Extract categories that have products
    const catIds = [...new Set(data.map((p) => p.categoria_id))];
    const cats: Categoria[] = catIds
      .filter((id) => CATEGORIAS_INFO[id])
      .map((id, i) => ({
        id,
        nombre: CATEGORIAS_INFO[id].nombre,
        icono: CATEGORIAS_INFO[id].icono,
        orden: i,
      }));
    setCategorias(cats);
    setLoading(false);
  }

  // Fetch stores for a category
  async function fetchTiendasCategoria(catId: string) {
    try {
      const res = await fetch(`/api/puestos?categoria=${catId}`);
      const data = await res.json();
      setTiendasCategoria(data);
    } catch {
      setTiendasCategoria([]);
    }
  }

  // Cada oferta = (producto, precio de una tienda). Una card por oferta:
  // así los filtros y orden actúan sobre la oferta concreta y dos tiendas
  // que vendan lo mismo compiten en cards independientes.
  const ofertasFiltradas = useMemo(() => {
    // Cuando no hay categoría seleccionada, sólo entregamos resultados si el
    // cliente está buscando algo — la búsqueda global desde la home recorre
    // todo el catálogo. Sin búsqueda, la home muestra el grid de categorías.
    const buscandoGlobal = !categoriaActual && busqueda.trim().length > 0;
    if (!categoriaActual && !buscandoGlobal) return [];
    let productos = categoriaActual
      ? todosProductos.filter((p) => p.categoria_id === categoriaActual)
      : todosProductos;
    if (seccionFiltro) {
      productos = productos.filter((p) => (p.seccion || "Otros") === seccionFiltro);
    }
    if (subseccionFiltro) {
      productos = productos.filter((p) => (p.subseccion || "Otros") === subseccionFiltro);
    }
    if (busqueda.trim()) {
      // Búsqueda exhaustiva: nombre, descripción, sección, subsección y
      // nombres de las tiendas que venden el producto. Así el cliente puede
      // teclear "panadería ana" y caen sus productos.
      productos = productos.filter((p) =>
        matchProducto(
          busqueda,
          p.nombre,
          p.descripcion,
          p.seccion,
          p.subseccion,
          ...p.precios.map((pr) => pr.puesto_nombre)
        )
      );
    }

    let ofertas = productos.flatMap((producto) =>
      producto.precios.map((precio) => ({ producto, precio }))
    );

    if (tiendaFiltro) {
      ofertas = ofertas.filter((o) => o.precio.puesto_id === tiendaFiltro);
    }
    if (soloAbiertas) {
      ofertas = ofertas.filter((o) => o.precio.cerrada !== true);
    }
    if (soloInmediato) {
      ofertas = ofertas.filter((o) => (o.precio.puesto_lead_time_dias ?? 0) === 0);
    }
    if (soloMayoreo) {
      ofertas = ofertas.filter((o) => o.precio.precio_mayoreo != null);
    }

    const normNombre = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    if (ordenFiltro === "menor") {
      ofertas = [...ofertas].sort((a, b) => a.precio.precio - b.precio.precio);
    } else if (ordenFiltro === "mayor") {
      ofertas = [...ofertas].sort((a, b) => b.precio.precio - a.precio.precio);
    } else if (ordenFiltro === "tiempo") {
      // Tiempo total estimado en minutos = días sobre pedido + viaje del
      // repartidor. Asume 15 km/h promedio (bici/moto en Sahuayo) → 4
      // min/km. NO modela tiempo de preparación del puesto (no está en
      // schema). Sin ubicación caemos a sólo lead_time + precio.
      const KM_A_MIN = 4;
      const DIA_EN_MIN = 1440;
      const tiempoEstimado = (precio: typeof ofertas[number]["precio"]) => {
        const dias = precio.puesto_lead_time_dias ?? 0;
        let viaje = 0;
        if (ubicacion && precio.puesto_lat != null && precio.puesto_lng != null) {
          viaje = haversineKm(ubicacion.lat, ubicacion.lng, precio.puesto_lat, precio.puesto_lng) * KM_A_MIN;
        }
        return dias * DIA_EN_MIN + viaje;
      };
      ofertas = [...ofertas].sort((a, b) => {
        const tA = tiempoEstimado(a.precio);
        const tB = tiempoEstimado(b.precio);
        if (tA !== tB) return tA - tB;
        return a.precio.precio - b.precio.precio;
      });
    } else if (ordenFiltro === "distancia" && ubicacion) {
      // Más cerca primero (haversine desde ubicación del cliente). Sin
      // ubicación caemos al "default"; el modal evita seleccionar esto si
      // no la hay, esto es defensivo.
      const dist = (lat?: number | null, lng?: number | null) => {
        if (lat == null || lng == null) return Number.POSITIVE_INFINITY;
        return haversineKm(ubicacion.lat, ubicacion.lng, lat, lng);
      };
      ofertas = [...ofertas].sort((a, b) => {
        const dA = dist(a.precio.puesto_lat, a.precio.puesto_lng);
        const dB = dist(b.precio.puesto_lat, b.precio.puesto_lng);
        return dA - dB;
      });
    } else {
      // Por defecto (Recomendado): agrupar por nombre normalizado y, dentro,
      // ordenar por rating de la tienda (DESC) y luego por precio (ASC).
      // Las tiendas con rating < 3 o sin rating quedan al fondo del grupo
      // — filtro pasivo que premia calidad sin esconder a nadie.
      const ratingScore = (r?: number | null) => {
        if (r == null) return 2.5; // neutral para tiendas nuevas
        return Number(r);
      };
      ofertas = [...ofertas].sort((a, b) => {
        const nA = normNombre(a.producto.nombre);
        const nB = normNombre(b.producto.nombre);
        if (nA !== nB) return nA.localeCompare(nB);
        // Mismo producto: tiendas mejor calificadas primero
        const rA = ratingScore(a.precio.puesto_rating);
        const rB = ratingScore(b.precio.puesto_rating);
        // Tiendas con <3 estrellas se demueven (suman 0.5 al precio efectivo
        // para sort, así una tienda mala con precio igual queda abajo).
        const penA = rA < 3 ? 100 : 0;
        const penB = rB < 3 ? 100 : 0;
        const effA = a.precio.precio + penA;
        const effB = b.precio.precio + penB;
        if (effA !== effB) return effA - effB;
        return rB - rA;
      });
    }
    return ofertas;
  }, [todosProductos, categoriaActual, tiendaFiltro, seccionFiltro, subseccionFiltro, ordenFiltro, busqueda, soloAbiertas, soloInmediato, soloMayoreo, ubicacion]);

  // Available sections for current filtered products (before section filter)
  const seccionesDisponibles = useMemo(() => {
    if (!categoriaActual) return [];
    let filtered = todosProductos.filter((p) => p.categoria_id === categoriaActual);
    if (tiendaFiltro) {
      filtered = filtered.map((p) => ({
        ...p,
        precios: p.precios.filter((pr) => pr.puesto_id === tiendaFiltro),
      })).filter((p) => p.precios.length > 0);
    }
    const secs = [...new Set(filtered.map((p) => p.seccion).filter(Boolean))] as string[];
    return secs.sort((a, b) => a.localeCompare(b, "es"));
  }, [todosProductos, categoriaActual, tiendaFiltro]);

  const subseccionesDisponibles = useMemo(() => {
    if (!seccionFiltro) return [];
    let filtered = todosProductos.filter((p) => p.categoria_id === categoriaActual);
    if (tiendaFiltro) {
      filtered = filtered.map((p) => ({
        ...p,
        precios: p.precios.filter((pr) => pr.puesto_id === tiendaFiltro),
      })).filter((p) => p.precios.length > 0);
    }
    filtered = filtered.filter((p) => (p.seccion || "Otros") === seccionFiltro);
    const subs = [...new Set(filtered.map((p) => p.subseccion).filter(Boolean))] as string[];
    return subs.sort((a, b) => a.localeCompare(b, "es"));
  }, [todosProductos, categoriaActual, tiendaFiltro, seccionFiltro]);

  const agregarAlCarrito = useCallback(
    (
      producto: ProductoConPrecios,
      precioInfo: { puesto_id: string; puesto_nombre: string; precio: number; precio_mayoreo?: number | null; mayoreo_desde?: number | null; puesto_ubicacion?: string },
      seleccion?: {
        variante: ProductoVariante | null;
        modificadores: SeleccionModificador[];
        cantidadInicial?: number;
      }
    ) => {
      const variante = seleccion?.variante ?? null;
      const modificadores = seleccion?.modificadores ?? [];
      const cantInicial = seleccion?.cantidadInicial ?? 1;

      // Precio base = override de variante (o base) + suma de precio_extra
      // de los valores de la variante + extras de modificadores.
      const extrasValores = sumarExtrasDeVariante(producto.opciones ?? [], variante);
      const extrasMods = modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);
      // Precio base (sin mayoreo) con extras ya sumados.
      const precioBaseItem = Number(variante?.precio_override ?? precioInfo.precio) + extrasValores + extrasMods;
      // Precio de mayoreo — sumamos también los extras (variante + modificadores)
      // porque se cobran por unidad, aplique o no mayoreo.
      const precioMayRaw = variante?.precio_mayoreo_override ?? precioInfo.precio_mayoreo ?? null;
      const precioMayItemConExtras = precioMayRaw != null
        ? Number(precioMayRaw) + extrasValores + extrasMods
        : null;
      const mayDesdeItem = variante?.mayoreo_desde_override ?? precioInfo.mayoreo_desde ?? null;

      // Helper — dado una cantidad total, devuelve el precio unitario correcto.
      const efectivoPara = (cantidad: number) =>
        precioMayItemConExtras != null && mayDesdeItem != null && cantidad >= mayDesdeItem
          ? precioMayItemConExtras
          : precioBaseItem;

      const clave = claveItemCarrito(producto.id, precioInfo.puesto_id, variante?.id ?? null, modificadores);

      setCarrito((prev) => {
        const existing = prev.find(
          (item) => claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []) === clave
        );
        if (existing) {
          return prev.map((item) => {
            const k = claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []);
            if (k !== clave) return item;
            const nuevaCantidad = item.cantidad + cantInicial;
            const efectivo = efectivoPara(nuevaCantidad);
            const comisionUnit = calcularComision(efectivo);
            return { ...item, cantidad: nuevaCantidad, precio_unitario: efectivo, comision: comisionUnit, subtotal: nuevaCantidad * efectivo };
          });
        }
        // Item nuevo: aplicar mayoreo desde el primer momento si ya cumple
        // el umbral (antes se ignoraba hasta el primer +/- en la lista).
        const efectivoInicial = efectivoPara(cantInicial);
        const comisionUnit = calcularComision(efectivoInicial);
        return [
          ...prev,
          {
            producto_id: producto.id,
            producto_nombre: producto.nombre,
            puesto_id: precioInfo.puesto_id,
            puesto_nombre: precioInfo.puesto_nombre,
            puesto_ubicacion: precioInfo.puesto_ubicacion,
            cantidad: cantInicial,
            precio_unitario: efectivoInicial,
            precio_base: precioBaseItem,
            precio_mayoreo: precioMayItemConExtras,
            mayoreo_desde: mayDesdeItem,
            comision: comisionUnit,
            unidad: producto.unidad,
            subtotal: efectivoInicial * cantInicial,
            variante_id: variante?.id ?? null,
            variante_nombre: variante?.nombre ?? null,
            modificadores,
          },
        ];
      });
    },
    []
  );

  // Repite un pedido pasado. Recorre los items y los agrega al carrito si el
  // producto + tienda siguen disponibles. Avisa si algunos quedaron afuera
  // (cambió el catálogo, tienda inactiva, variante removida, etc.).
  function volverAComprar(pedido: PedidoConItems) {
    const omitidos: string[] = [];
    let agregados = 0;
    for (const item of pedido.items) {
      const prod = todosProductos.find((p) => p.id === item.producto_id);
      const precio = prod?.precios.find((pr) => pr.puesto_id === item.puesto_id);
      if (!prod || !precio) {
        omitidos.push(item.producto_nombre || "producto desconocido");
        continue;
      }
      // Si el item original tenía variante, intentamos rehidratarla.
      let varianteRehid: ProductoVariante | null = null;
      if (item.variante_id) {
        varianteRehid = (prod.variantes ?? []).find((v) => v.id === item.variante_id) ?? null;
        if (!varianteRehid) {
          omitidos.push(item.producto_nombre || "producto desconocido");
          continue;
        }
      }
      agregarAlCarrito(
        prod,
        {
          puesto_id: precio.puesto_id,
          puesto_nombre: precio.puesto_nombre,
          precio: precio.precio,
          precio_mayoreo: precio.precio_mayoreo ?? null,
          mayoreo_desde: precio.mayoreo_desde ?? null,
          puesto_ubicacion: precio.puesto_ubicacion,
        },
        {
          variante: varianteRehid,
          modificadores: item.modificadores ?? [],
          cantidadInicial: Number(item.cantidad) || 1,
        }
      );
      agregados++;
    }
    setTab("carrito");
    if (omitidos.length > 0) {
      const lista = Array.from(new Set(omitidos)).slice(0, 5).join(", ");
      alert(`Se agregaron ${agregados} producto${agregados === 1 ? "" : "s"} a tu lista. No pudimos agregar: ${lista}${omitidos.length > 5 ? ", ..." : ""}.`);
    }
  }

  function cambiarCantidad(clave: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((item) => {
          const k = claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []);
          if (k === clave) {
            const nueva = item.cantidad + delta;
            if (nueva <= 0) return null;
            const efectivo = (item.precio_mayoreo != null && item.mayoreo_desde != null && nueva >= item.mayoreo_desde)
              ? item.precio_mayoreo
              : item.precio_base;
            const comisionUnit = calcularComision(efectivo);
            return { ...item, cantidad: nueva, precio_unitario: efectivo, comision: comisionUnit, subtotal: nueva * efectivo };
          }
          return item;
        })
        .filter(Boolean) as ItemCarrito[]
    );
  }

  function getItemSimpleEnCarrito(productoId: string, puestoId: string) {
    // Solo para productos sin variantes/modificadores — devuelve el ítem simple.
    return carrito.find(
      (item) =>
        item.producto_id === productoId &&
        item.puesto_id === puestoId &&
        !item.variante_id &&
        (!item.modificadores || item.modificadores.length === 0)
    );
  }

  async function fetchMisPedidos() {
    setLoadingPedidos(true);
    try {
      const res = await fetch("/api/mis-pedidos");
      if (res.ok) {
        const data: PedidoConItems[] = await res.json();

        // Detect order status changes and notify
        const labelEnvio: Record<string, string> = {
          en_compra: "Tu repartidor va por el paquete",
          en_camino: "Tu paquete va en camino",
          entregado: "Tu paquete fue entregado",
          cancelado: "Tu envío fue cancelado",
        };
        const labelMercado: Record<string, string> = {
          en_compra: "Tu pedido esta siendo comprado",
          en_camino: "Tu pedido va en camino",
          entregado: "Tu pedido fue entregado",
          cancelado: "Tu pedido fue cancelado",
        };
        for (const pedido of data) {
          const prev = prevEstadosPedidos.current[pedido.id];
          const labels = pedido.tipo === "envio" ? labelEnvio : labelMercado;
          if (prev && prev !== pedido.estado && labels[pedido.estado]) {
            playBeep(600, 0.3);
            showNotification(
              "Mercadito - Actualizacion de pedido",
              labels[pedido.estado],
              "/cliente"
            );
          }
          prevEstadosPedidos.current[pedido.id] = pedido.estado;
        }

        setMisPedidos(data);
      }
    } catch {
      // ignore
    }
    setLoadingPedidos(false);
  }

  async function cancelarPedido(pedidoId: string) {
    const motivo = prompt("¿Por que quieres cancelar?\n\nEjemplo: Ya no lo necesito, me equivoque de productos, etc.");
    if (motivo === null) return; // user pressed Cancel
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "cancelado", motivo_cancelacion: motivo || "Sin motivo" }),
    });
    if (res.ok) {
      alert("Pedido cancelado. Si el repartidor ya iba en camino, te contactara por telefono.");
      fetchMisPedidos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo cancelar");
    }
  }

  // Load orders when switching to pedidos tab + auto-refresh every 15s
  useEffect(() => {
    if (tab === "pedidos" && usuario) {
      fetchMisPedidos();
      const interval = setInterval(fetchMisPedidos, 15000);
      return () => clearInterval(interval);
    }
  }, [tab, usuario]);

  // precio_unitario en el carrito es el precio REAL (sin comision). La comision va
  // como renglon aparte en el desglose del total.
  const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const servicioMercadito = carrito.reduce((s, i) => s + i.cantidad * (i.comision || 0), 0);
  // Ahorro por precio de mayoreo aplicado: para cada item con mayoreo activo,
  // (precio_base - precio_unitario) * cantidad. Si no hay mayoreo, es 0.
  const promocionMayoreo = carrito.reduce((s, i) => {
    if (i.precio_mayoreo != null && i.mayoreo_desde != null && i.cantidad >= i.mayoreo_desde) {
      return s + (i.precio_base - i.precio_unitario) * i.cantidad;
    }
    return s;
  }, 0);
  // Card surcharge: 3.50% + IVA (16%) = 4.06%
  const RECARGO_TARJETA = 0.0406;
  const baseConEnvio = subtotal + servicioMercadito + costoEnvio;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(baseConEnvio * RECARGO_TARJETA) : 0;
  const total = baseConEnvio + recargoTarjeta;

  // Determine all delivery origins (all stores with items in cart), sorted by subtotal desc
  // Callbacks memoizados para MapaEntrega: si usamos inline arrow functions,
  // cada render crea una nueva referencia, lo que dispara un bucle dentro
  // del mapa (actualizarRuta useCallback -> useEffect -> setState -> rerender).
  const handleUbicacionSeleccionada = useCallback((data: {
    lat: number; lng: number; costoEnvio: number; zona: string; tiempoTotal: string;
  }) => {
    setUbicacion({ lat: data.lat, lng: data.lng });
    setCostoEnvio(data.costoEnvio);
    setZonaEnvio(data.zona);
    setTiempoEnvio(data.tiempoTotal);
  }, []);
  const handleDireccionDetectada = useCallback((dir: string) => setDireccion(dir), []);

  const tiendasOrigen = useMemo(() => {
    if (carrito.length === 0) return [];

    // Count subtotal per puesto
    const puestoTotals: Record<string, number> = {};
    for (const item of carrito) {
      puestoTotals[item.puesto_id] = (puestoTotals[item.puesto_id] || 0) + item.subtotal;
    }

    // Get unique puestos sorted by subtotal desc
    const sortedPuestos = Object.entries(puestoTotals).sort((a, b) => b[1] - a[1]);

    // Find coordinates for each puesto from productos data
    const origenes: { lat: number; lng: number; nombre: string }[] = [];
    const seen = new Set<string>();

    for (const [puestoId] of sortedPuestos) {
      if (seen.has(puestoId)) continue;
      for (const p of todosProductos) {
        for (const pr of p.precios) {
          if (pr.puesto_id === puestoId && pr.puesto_lat && pr.puesto_lng && !seen.has(puestoId)) {
            origenes.push({ lat: pr.puesto_lat, lng: pr.puesto_lng, nombre: pr.puesto_nombre });
            seen.add(puestoId);
          }
        }
      }
    }
    return origenes;
  }, [carrito, todosProductos]);

  async function verificarYEnviar() {
    // Pedidos requieren sesión válida (con PIN). Antes aceptábamos pedidos
    // anónimos; ahora si no hay sesión enviamos al cliente al tab Pedidos
    // donde está el formulario de login con PIN.
    if (!usuario || usuario.rol !== "cliente") {
      alert("Inicia sesión con tu teléfono y PIN para hacer un pedido.");
      setTab("pedidos");
      return;
    }
    if (!nombre || !telefono) {
      alert("Por favor llena tu nombre y telefono");
      return;
    }
    if (!ubicacion || !direccion) {
      alert("Marca tu punto de entrega en el mapa para obtener la direccion");
      return;
    }
    if (costoEnvio === 0) {
      alert("Tu ubicacion esta fuera de la zona de cobertura");
      return;
    }

    // Check hours
    const horario = getHorarioInfo();
    if (!horario.abierto) {
      alert(horario.mensaje);
      return;
    }
    if (horario.esNocturno) {
      const totalNocturno = total + horario.recargoNocturno;
      if (!confirm(
        `Tu pedido tiene un recargo nocturno de $${horario.recargoNocturno} por entrega fuera de horario.\n\n` +
        `Total a pagar: $${totalNocturno.toFixed(2)}\n\n` +
        `¿Deseas continuar?`
      )) return;
    }

    // Fetch current prices and compare
    setEnviando(true);
    try {
      const res = await fetch("/api/productos?visible_solo=true");
      const productosActuales: ProductoConPrecios[] = await res.json();

      const cambios: { producto: string; tienda: string; antes: number; ahora: number; diff: number }[] = [];
      const carritoActualizado = carrito.map((item) => {
        const prod = productosActuales.find((p) => p.id === item.producto_id);
        const precioActual = prod?.precios.find((pr) => pr.puesto_id === item.puesto_id);
        if (!precioActual) return item;

        // Respetar variante y modificadores congelados en el item: sumar sus
        // extras (precio_extra de cada valor de la variante + precio_extra de
        // cada modificador elegido). Antes solo comparábamos el precio base
        // del API, por eso al verificar creía que el precio había "bajado" el
        // monto de los extras.
        const variante = item.variante_id
          ? prod?.variantes?.find((v) => v.id === item.variante_id) ?? null
          : null;
        const extrasValores = sumarExtrasDeVariante(prod?.opciones ?? [], variante);
        const extrasMods = (item.modificadores ?? []).reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);

        const baseRaw = Number(variante?.precio_override ?? precioActual.precio);
        const mayRaw = variante?.precio_mayoreo_override ?? precioActual.precio_mayoreo ?? null;
        const mayDesdeActual = variante?.mayoreo_desde_override ?? precioActual.mayoreo_desde ?? null;

        const baseEfectivo = baseRaw + extrasValores + extrasMods;
        const mayEfectivo = mayRaw != null ? Number(mayRaw) + extrasValores + extrasMods : null;
        const efectivoActual =
          mayEfectivo != null && mayDesdeActual != null && item.cantidad >= mayDesdeActual
            ? mayEfectivo
            : baseEfectivo;

        if (efectivoActual !== item.precio_unitario) {
          cambios.push({
            producto: item.producto_nombre,
            tienda: item.puesto_nombre,
            antes: item.precio_unitario,
            ahora: efectivoActual,
            diff: efectivoActual - item.precio_unitario,
          });
          return {
            ...item,
            precio_base: baseEfectivo,
            precio_mayoreo: mayEfectivo,
            mayoreo_desde: mayDesdeActual,
            precio_unitario: efectivoActual,
            comision: calcularComision(efectivoActual),
            subtotal: item.cantidad * efectivoActual,
          };
        }
        return item;
      });

      if (cambios.length > 0) {
        const nuevoSub = carritoActualizado.reduce((s, i) => s + i.subtotal, 0);
        setCambiosPrecio(cambios);
        setNuevoSubtotal(nuevoSub);
        // Update cart with new prices
        setCarrito(carritoActualizado);
        setEnviando(false);
        return; // Show modal, don't send yet
      }
    } catch {
      // If price check fails, continue with current prices
    }

    // No changes, send directly
    await enviarPedido();
  }

  // Cuando cambia el carrito, traemos las ventanas en que TODAS las tiendas
  // del carrito están abiertas a la vez. Esto reemplaza al selector estático
  // (mañana 9 am, etc.) — ahora ofrecemos solo opciones realistas. Si una
  // tienda solo abre en la tarde, "Mañana 9 am" simplemente no aparecerá.
  useEffect(() => {
    if (carrito.length === 0) {
      setVentanasOpciones([]);
      setAhoraDisponible(true);
      return;
    }
    // Pasamos producto:puesto en cada par para que la API use el lead_time
    // override por producto cuando exista.
    const pares = Array.from(new Set(carrito.map((c) => `${c.producto_id}:${c.puesto_id}`))).join(",");
    let cancel = false;
    fetch(`/api/puestos/ventanas-comunes?pares=${pares}`)
      .then((r) => r.json())
      .then((data: { ahora_disponible: boolean; ventanas: { inicio: string; fin: string; label: string }[] }) => {
        if (cancel) return;
        setAhoraDisponible(!!data.ahora_disponible);
        setVentanasOpciones(data.ventanas || []);
        // Si "ahora" no está disponible y el cliente no había escogido nada,
        // forzamos la primera ventana válida para que pueda confirmar.
        if (!data.ahora_disponible && agendadoIso === null && data.ventanas?.length) {
          setAgendadoIso(data.ventanas[0].inicio);
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito]);

  async function enviarPedido() {
    setEnviando(true);
    setCambiosPrecio(null);

    const agendadoFecha = agendadoIso ? new Date(agendadoIso) : null;
    const sufijoMetodo =
      metodoPago === "tarjeta" ? " [PAGO CON TARJETA]" :
      metodoPago === "transferencia" ? " [PAGO POR TRANSFERENCIA]" : "";
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        zona_id: "custom",
        direccion_entrega: `${direccion}${numeroCasa ? ` #${numeroCasa}` : ""} [${ubicacion!.lat.toFixed(6)}, ${ubicacion!.lng.toFixed(6)}]`,
        notas: notas ? `${notas}${sufijoMetodo}` : (sufijoMetodo.trim() || undefined),
        costo_envio_override: costoEnvio,
        metodo_pago: metodoPago,
        recargo_tarjeta: recargoTarjeta,
        comprobante_pago: metodoPago === "transferencia" ? comprobantePago : undefined,
        agendado_para: agendadoFecha ? agendadoFecha.toISOString() : undefined,
        items: carrito.map((item) => ({
          producto_id: item.producto_id,
          puesto_id: item.puesto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          comision: item.comision,
          variante_id: item.variante_id ?? null,
          variante_nombre: item.variante_nombre ?? null,
          modificadores: item.modificadores ?? [],
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setPedidoConfirmado(data.id);
      setCarrito([]);
      // Guardar perfil de entrega para pre-llenar la próxima vez. Persiste
      // en localStorage para no obligar al cliente a reescribir su dirección.
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("mercadito_cliente_perfil", JSON.stringify({
            direccion,
            numeroCasa,
            notas,
            ubicacion,
          }));
        }
      } catch {
        // localStorage llena o bloqueada — no es crítico.
      }
      fetchMisPedidos();
    } else {
      // Surface el mensaje real del backend en vez de un "intenta de nuevo".
      const data = await res.json().catch(() => ({} as { error?: string }));
      // Sesión expirada o ausente — mandar al tab de login con PIN.
      if (res.status === 401) {
        alert(data?.error || "Inicia sesión con tu teléfono y PIN para hacer un pedido.");
        setTab("pedidos");
      } else {
        alert(data?.error || "No se pudo enviar el pedido. Revisa tus datos e intenta de nuevo.");
      }
    }
    setEnviando(false);
  }

  function resetearPedido() {
    setPedidoConfirmado(null);
    setNombre("");
    setTelefono("");
    setDireccion("");
    setNotas("");
    setUbicacion(null);
    setCostoEnvio(0);
    setMetodoPago("efectivo");
    setComprobantePago(null);
    setAgendadoIso(null);
    setTab("comprar");
    setCategoriaActual(null);
  }

  // ── PEDIDO CONFIRMADO ──
  if (pedidoConfirmado) {
    return (
      <div className="min-h-screen bg-cream">
        <Header title="Mercadito" mostrarLogin />
        <main className="max-w-lg mx-auto px-4 py-8 text-center">
          <span className="text-7xl block mb-4">✅</span>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Pedido recibido!</h2>
          <p className="text-gray-500 mb-6">
            Te contactaremos por WhatsApp para confirmar.
          </p>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <p className="text-sm text-gray-400">Número de pedido</p>
            <p className="font-mono font-bold text-2xl text-navy">
              {pedidoConfirmado.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            onClick={resetearPedido}
            className="bg-brand text-white px-8 py-3 rounded-full font-bold text-lg active:scale-95 transition-transform"
          >
            Hacer otro pedido
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header title="Mercadito" />

      {/* ── TABS ── */}
      <div className="bg-white border-b sticky top-14 z-30">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: "comprar" as Tab, label: "Comprar", icon: "🛍️" },
            { id: "carrito" as Tab, label: "Mi Lista", icon: "📋", badge: carrito.length },
            { id: "entregar" as Tab, label: "Entrega", icon: "🛵" },
            { id: "pedidos" as Tab, label: "Pedidos", icon: "📦", badge: misPedidos.filter(p => p.estado !== "entregado" && p.estado !== "cancelado").length || undefined },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === "comprar") {
                  // Al tocar "Comprar" desde cualquier tab, volver a la pantalla
                  // "¿Qué necesitas hoy?" para que el usuario pueda reelegir sección.
                  setCategoriaActual(null);
                  setTiendaFiltro(null);
                  setSeccionFiltro(null);
                  setSubseccionFiltro(null);
                }
                setTab(t.id);
              }}
              className={`flex-1 py-3 text-center font-bold text-sm border-b-3 transition-colors relative ${
                tab === t.id
                  ? "border-brand text-brand-dark"
                  : "border-transparent text-gray-400"
              }`}
            >
              <span className="text-lg">{t.icon}</span>
              <span className="block text-xs mt-0.5">{t.label}</span>
              {t.badge ? (
                <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-24">
        {/* ══════════════ TAB: COMPRAR ══════════════ */}
        {tab === "comprar" && (
          <div className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-gray-400">Cargando productos...</div>
            ) : !categoriaActual ? (
              /* ── Home: barra de búsqueda + grid de categorías. Si el cliente
                     escribe en la barra, mostramos resultados globales en
                     lugar del grid. */
              <div>
                {/* Anuncios con imagen — el admin sube banners promocionales
                    sin redeploy. Si no hay imagen, muestra como tarjeta de
                    texto compacta más abajo. */}
                {busqueda.trim().length === 0 && anuncios.filter((a) => a.imagen).slice(0, 1).map((a) => (
                  <a
                    key={a.id}
                    href={a.link || "#"}
                    {...(a.link && a.link !== "#" ? { target: "_blank", rel: "noopener noreferrer" } : { onClick: (e) => e.preventDefault() })}
                    className="block mb-3 rounded-xl overflow-hidden shadow-sm relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.imagen!} alt={a.titulo} className="w-full h-auto object-cover" />
                  </a>
                ))}

                {/* Búsqueda primero — es lo que el usuario más usa. */}
                <div className="mb-3">
                  <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar producto, tienda…" />
                </div>

                {busqueda.trim().length === 0 ? (
                  <>
                    {/* "Ya probaste esto" — arriba para que sea lo primero que
                        ve el cliente al abrir la app (descubrimiento de
                        entrada). El componente trae mb-4 propio. */}
                    {todosProductos.length > 0 && (
                      <BannerProductoDestacado
                          ofertas={todosProductos.flatMap((producto) =>
                            producto.precios.map((precio) => ({ producto, precio }))
                          )}
                          onAgregar={({ producto, precio }) => {
                            const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
                            if (tieneExtras) {
                              setVarianteModal({ producto, precio });
                            } else {
                              agregarAlCarrito(producto, {
                                puesto_id: precio.puesto_id,
                                puesto_nombre: precio.puesto_nombre,
                                precio: precio.precio,
                                precio_mayoreo: precio.precio_mayoreo ?? null,
                                mayoreo_desde: precio.mayoreo_desde ?? null,
                                puesto_ubicacion: precio.puesto_ubicacion,
                              });
                            }
                          }}
                        />
                    )}

                    {/* Mandar paquete — debajo del banner destacado.
                        mb-4 para igualar el espacio con lo que viene debajo. */}
                    <button
                      type="button"
                      onClick={() => setMostrarEnvio(true)}
                      className="w-full mb-4 bg-gradient-to-r from-brand to-brand-dark text-white rounded-xl py-2.5 px-3 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <span className="text-2xl">📦</span>
                        <span className="font-bold text-sm">Mandar paquete</span>
                        <span className="text-[11px] opacity-90 hidden sm:inline">· entre Sahuayo, Jiquilpan, V. Carranza</span>
                      </div>
                      <span className="text-base">→</span>
                    </button>

                    {/* Notificaciones — arriba también, junto al mandar paquete.
                        El componente no trae mb propio; wrapper para que el
                        gap inferior coincida con el del banner destacado (16). */}
                    <div className="mb-4">
                      <NotificationBanner mensaje="Activa las notificaciones para saber cuando tu pedido va en camino" />
                    </div>

                    {/* Anuncios sin imagen — tarjeta de texto compacta. Los
                        que tienen imagen ya se muestran arriba como banner. */}
                    {(() => {
                      const sinImagen = anuncios.filter((a) => !a.imagen);
                      if (sinImagen.length === 0) return null;
                      return (
                        <div className="mb-3 bg-brand-light border border-brand/40 rounded-xl px-3 py-2">
                          <p className="font-bold text-navy text-xs">{sinImagen[0].titulo}</p>
                          <p className="text-[11px] text-brand-dark">{sinImagen[0].mensaje}</p>
                        </div>
                      );
                    })()}

                    {/* Categorías — TODAS visibles. El cliente decide cuál
                        explorar sin tener que abrir un sheet. */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {categoriasOrdenadas.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setCategoriaActual(cat.id);
                            setTiendaFiltro(null);
                            setSeccionFiltro(null); setSubseccionFiltro(null);
                            fetchTiendasCategoria(cat.id);
                          }}
                          className="bg-white rounded-2xl py-3 px-2 shadow-sm flex flex-col items-center gap-1 active:scale-95 transition-transform border-2 border-transparent hover:border-brand"
                        >
                          <span className="text-3xl">{cat.icono}</span>
                          <span className="font-bold text-[11px] text-gray-700 text-center leading-tight">{cat.nombre}</span>
                        </button>
                      ))}
                    </div>

                  </>
                ) : ofertasFiltradas.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                    <div className="text-6xl mb-3">🔎</div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Sin resultados para &quot;{busqueda}&quot;</h3>
                    <p className="text-sm text-gray-500 mb-4">Prueba con otra palabra o entra a una categoría.</p>
                    <button
                      onClick={() => setBusqueda("")}
                      className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                    >
                      Limpiar búsqueda
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-3">
                      {ofertasFiltradas.length} resultado{ofertasFiltradas.length === 1 ? "" : "s"} para &quot;{busqueda}&quot;
                    </p>
                    <div className="space-y-2">
                      {ofertasFiltradas.map(({ producto: prod, precio }) => {
                        const tieneExtras = (prod.variantes && prod.variantes.length > 0) || (prod.modificadores && prod.modificadores.length > 0);
                        const enCarrito = !tieneExtras ? getItemSimpleEnCarrito(prod.id, precio.puesto_id) : null;
                        const claveSimple = !tieneExtras ? claveItemCarrito(prod.id, precio.puesto_id, null, []) : null;
                        return (
                          <ProductCardCompacta
                            key={`${prod.id}-${precio.puesto_id}`}
                            producto={prod}
                            precio={precio}
                            enCarrito={enCarrito?.cantidad ?? 0}
                            tieneExtras={tieneExtras}
                            onAgregar={() => {
                              if (tieneExtras) {
                                setVarianteModal({ producto: prod, precio });
                              } else {
                                agregarAlCarrito(prod, {
                                  puesto_id: precio.puesto_id,
                                  puesto_nombre: precio.puesto_nombre,
                                  precio: precio.precio,
                                  precio_mayoreo: precio.precio_mayoreo ?? null,
                                  mayoreo_desde: precio.mayoreo_desde ?? null,
                                  puesto_ubicacion: precio.puesto_ubicacion,
                                });
                              }
                            }}
                            onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── Productos de la categoría ── */
              <div>
                {/* Swipeable category bar — full width with scroll */}
                <div className="-mx-4 px-4 mb-1">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-snap-x py-2">
                    <button
                      onClick={() => { setCategoriaActual(null); setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
                      className="flex-shrink-0 flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium bg-gray-200 text-gray-700 active:scale-95 transition-transform"
                    >
                      ← Volver a secciones
                    </button>
                    {categorias.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setCategoriaActual(cat.id);
                          setTiendaFiltro(null);
                          setSeccionFiltro(null); setSubseccionFiltro(null);
                          fetchTiendasCategoria(cat.id);
                        }}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                          cat.id === categoriaActual
                            ? "bg-brand text-white shadow-md"
                            : "bg-white text-gray-600 shadow-sm border border-gray-100"
                        }`}
                      >
                        <span className="text-base">{cat.icono}</span>
                        {cat.nombre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Búsqueda — persiste al cambiar tienda / sección */}
                <div className="mb-3">
                  <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar producto..." />
                </div>

                {/* Store slider */}
                {tiendasCategoria.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-1.5">Tiendas:</p>
                    <div ref={sliderTiendasRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      <button
                        onClick={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
                        className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors min-w-[70px] ${
                          !tiendaFiltro
                            ? "bg-brand-light border-2 border-brand"
                            : "bg-white border-2 border-gray-100"
                        }`}
                      >
                        <span className="text-lg">🛒</span>
                        <span className="text-[10px] text-gray-600">Todas</span>
                      </button>
                      {[...tiendasCategoria].sort((a, b) => {
                        // Cerradas al final, abiertas al frente. Dentro de cada
                        // grupo, alfabético — el cliente busca "Garden" sin
                        // tener que recordar el orden de inserción.
                        const ca = a.abierto_ahora === false ? 1 : 0;
                        const cb = b.abierto_ahora === false ? 1 : 0;
                        if (ca !== cb) return ca - cb;
                        return a.nombre.localeCompare(b.nombre, "es");
                      }).map((t) => {
                        const cerrada = t.abierto_ahora === false;
                        return (
                        <button
                          key={t.id}
                          onClick={() => { setTiendaFiltro(t.id); setSeccionFiltro(null); setSubseccionFiltro(null); }}
                          className={`relative flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors min-w-[70px] ${
                            tiendaFiltro === t.id
                              ? "bg-brand-light border-2 border-brand"
                              : "bg-white border-2 border-gray-100"
                          } ${cerrada ? "opacity-50 grayscale" : ""}`}
                        >
                          {/* Sin logo propio (NULL o placeholder SVG autogenerado <1KB)
                              → fallback al logo de Mercadito en lugar del emoji genérico. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              !t.logo ||
                              (t.logo.startsWith("data:image/svg+xml;base64,") && t.logo.length < 1000)
                                ? "/logo.png"
                                : t.logo
                            }
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                          <span className="text-[10px] text-gray-600 truncate max-w-[60px]">{t.nombre}</span>
                          {cerrada && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">Cerrada</span>
                          )}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Barra unificada de filtros: 4 chips fijos. Sección y
                    subsección se mueven al sheet "Filtros". Las opciones de
                    orden (precio, mayoreo) van al sheet "Ordenar". */}
                {(() => {
                  const filtrosPanelActivos = (seccionFiltro ? 1 : 0) + (subseccionFiltro ? 1 : 0) + (soloMayoreo ? 1 : 0);
                  const ordenLabel =
                    ordenFiltro === "menor" ? "Menor precio"
                    : ordenFiltro === "mayor" ? "Mayor precio"
                    : ordenFiltro === "tiempo" ? "Más rápido"
                    : ordenFiltro === "distancia" ? "Más cerca"
                    : "Recomendado";
                  return (
                    <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1 sticky top-14 z-20 bg-cream py-2 -mx-4 px-4">
                      <button
                        onClick={() => setSoloAbiertas((v) => !v)}
                        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          soloAbiertas ? "bg-green-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                        }`}
                      >
                        <span>🟢</span>
                        <span>Solo abiertas</span>
                      </button>
                      <button
                        onClick={() => setSoloInmediato((v) => !v)}
                        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          soloInmediato ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                        }`}
                      >
                        <span>⚡</span>
                        <span>Inmediato</span>
                      </button>
                      <button
                        onClick={() => setSheetOrdenar(true)}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200"
                      >
                        <span>↑↓</span>
                        <span>{ordenLabel}</span>
                      </button>
                      <button
                        onClick={() => setSheetFiltros(true)}
                        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          filtrosPanelActivos > 0 ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                        }`}
                      >
                        <span>⚙</span>
                        <span>Filtros{filtrosPanelActivos > 0 ? ` (${filtrosPanelActivos})` : ""}</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Chips de filtros activos — una ✕ por filtro, sin tener
                    que abrir el sheet. Solo abiertas/Inmediato no se
                    duplican aquí porque ya tienen su toggle visible. */}
                {(() => {
                  type Chip = { key: string; label: string; clear: () => void };
                  const chips: Chip[] = [];
                  if (tiendaFiltro) {
                    const t = tiendasCategoria.find((x) => x.id === tiendaFiltro);
                    chips.push({ key: "tienda", label: t?.nombre ?? "Tienda", clear: () => setTiendaFiltro(null) });
                  }
                  if (seccionFiltro) chips.push({ key: "sec", label: seccionFiltro, clear: () => { setSeccionFiltro(null); setSubseccionFiltro(null); } });
                  if (subseccionFiltro) chips.push({ key: "sub", label: subseccionFiltro, clear: () => setSubseccionFiltro(null) });
                  if (soloMayoreo) chips.push({ key: "may", label: "Solo mayoreo", clear: () => setSoloMayoreo(false) });
                  if (ordenFiltro !== "default") {
                    const lbl = ordenFiltro === "menor" ? "Menor precio"
                      : ordenFiltro === "mayor" ? "Mayor precio"
                      : ordenFiltro === "tiempo" ? "Más rápido"
                      : "Más cerca";
                    chips.push({ key: "ord", label: lbl, clear: () => setOrdenFiltro("default") });
                  }
                  if (chips.length === 0) return null;
                  return (
                    <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {chips.map((c) => (
                        <button
                          key={c.key}
                          onClick={c.clear}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold bg-brand text-white"
                          aria-label={`Quitar filtro ${c.label}`}
                        >
                          <span>{c.label}</span>
                          <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[10px]">✕</span>
                        </button>
                      ))}
                      {chips.length > 1 && (
                        <button
                          onClick={() => {
                            setTiendaFiltro(null);
                            setSeccionFiltro(null);
                            setSubseccionFiltro(null);
                            setSoloMayoreo(false);
                            setOrdenFiltro("default");
                          }}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-gray-400 text-gray-600"
                        >
                          Limpiar todo
                        </button>
                      )}
                    </div>
                  );
                })()}

                {ofertasFiltradas.length === 0 && (() => {
                  // Detección de motivo del vacío para mostrar mensaje correcto.
                  // Prioridad: tienda elegida cerrada → ya cerraron;
                  //   solo mayoreo activo → sin productos en oferta;
                  //   filtros varios → sin match.
                  const tiendaActual = tiendaFiltro ? tiendasCategoria.find((t) => t.id === tiendaFiltro) : null;
                  const tiendaCerrada = tiendaActual?.abierto_ahora === false;
                  const filtrosActivos = !!(tiendaFiltro || seccionFiltro || subseccionFiltro || ordenFiltro !== "default" || soloAbiertas || soloMayoreo || soloInmediato);
                  const busquedaActiva = busqueda.trim().length > 0;

                  if (soloAbiertas && !busquedaActiva && !tiendaFiltro && !seccionFiltro && !subseccionFiltro && ordenFiltro === "default" && !soloMayoreo && !soloInmediato) {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="text-6xl mb-3">🌙</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Todas las tiendas cerradas</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          En este momento ninguna tienda de esta categoría está abierta. Quita el filtro para verlas igualmente o vuelve más tarde.
                        </p>
                        <button
                          onClick={() => setSoloAbiertas(false)}
                          className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                          Mostrar todas
                        </button>
                      </div>
                    );
                  }
                  if (busquedaActiva) {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="text-6xl mb-3">🔎</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Sin resultados para &quot;{busqueda}&quot;</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          Prueba con otra palabra o quita los filtros para ver más opciones.
                        </p>
                        <button
                          onClick={() => setBusqueda("")}
                          className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                          Limpiar búsqueda
                        </button>
                      </div>
                    );
                  }
                  if (tiendaCerrada) {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-red-200 shadow-sm">
                        <div className="text-6xl mb-3">🏪💤</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Esta tienda ya cerró por hoy</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          {tiendaActual?.nombre.trim()} retomará pedidos en su próximo horario. Mientras, prueba otra tienda.
                        </p>
                        <button
                          onClick={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
                          className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                          Ver otras tiendas
                        </button>
                      </div>
                    );
                  }
                  if (soloMayoreo) {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="text-6xl mb-3">💰</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Sin productos en mayoreo</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          No encontramos productos con descuento por volumen aquí. Prueba otra categoría o quita el filtro.
                        </p>
                        <button
                          onClick={() => setSoloMayoreo(false)}
                          className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                          Quitar filtro
                        </button>
                      </div>
                    );
                  }
                  if (filtrosActivos) {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="text-6xl mb-3">🔍</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">No encontramos productos</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          Con los filtros que tienes no hay nada que mostrar. Prueba quitando alguno.
                        </p>
                        <button
                          onClick={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); setOrdenFiltro("default"); setSoloAbiertas(false); setSoloInmediato(false); setSoloMayoreo(false); }}
                          className="bg-brand text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                          Limpiar filtros
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                      <div className="text-6xl mb-3">🛒</div>
                      <h3 className="text-lg font-bold text-gray-800 mb-1">Sin productos por ahora</h3>
                      <p className="text-sm text-gray-500">
                        Aún no hay productos en esta categoría. Vuelve pronto — estamos sumando tiendas cada semana.
                      </p>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  {ofertasFiltradas.map(({ producto: prod, precio }) => {
                    const tieneExtras = (prod.variantes && prod.variantes.length > 0) || (prod.modificadores && prod.modificadores.length > 0);
                    const enCarrito = !tieneExtras ? getItemSimpleEnCarrito(prod.id, precio.puesto_id) : null;
                    const claveSimple = !tieneExtras ? claveItemCarrito(prod.id, precio.puesto_id, null, []) : null;
                    return (
                      <ProductCardCompacta
                        key={`${prod.id}-${precio.puesto_id}`}
                        producto={prod}
                        precio={precio}
                        enCarrito={enCarrito?.cantidad ?? 0}
                        tieneExtras={tieneExtras}
                        onAgregar={() => {
                          if (tieneExtras) {
                            setVarianteModal({ producto: prod, precio });
                          } else {
                            agregarAlCarrito(prod, {
                              puesto_id: precio.puesto_id,
                              puesto_nombre: precio.puesto_nombre,
                              precio: precio.precio,
                              precio_mayoreo: precio.precio_mayoreo ?? null,
                              mayoreo_desde: precio.mayoreo_desde ?? null,
                              puesto_ubicacion: precio.puesto_ubicacion,
                            });
                          }
                        }}
                        onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TAB: MI LISTA / CARRITO ══════════════ */}
        {tab === "carrito" && (
          <div className="mt-4">
            {carrito.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-6xl block mb-4">📋</span>
                <p className="text-gray-400 text-lg mb-2">Tu lista está vacía</p>
                <p className="text-sm text-gray-300">Agrega productos desde la pestaña Comprar</p>
              </div>
            ) : (
              <>
                {/* La promo se anuncia como anuncio (admin-managed con imagen);
                    aquí ya no se muestra banner hardcoded. La lógica del
                    backend sigue auto-aplicando envío gratis cada N pedidos. */}
                {/* Aviso si el carrito mezcla tiendas inmediatas con tiendas
                    por encargo. Permite resolver con un toque sin tener que
                    quitar item por item. */}
                {(() => {
                  // Construimos info por puesto desde todosProductos (que
                  // tiene puesto_lead_time_dias en cada precio).
                  const leadByPuesto = new Map<string, number>();
                  for (const prod of todosProductos) {
                    for (const pr of prod.precios) {
                      if (pr.puesto_lead_time_dias != null) leadByPuesto.set(pr.puesto_id, pr.puesto_lead_time_dias);
                    }
                  }
                  const leadDeItem = (puestoId: string) => leadByPuesto.get(puestoId) ?? 0;
                  const conLead = carrito.filter((c) => leadDeItem(c.puesto_id) > 0);
                  const sinLead = carrito.filter((c) => leadDeItem(c.puesto_id) === 0);
                  if (conLead.length === 0 || sinLead.length === 0) return null;
                  const maxLead = Math.max(...conLead.map((c) => leadDeItem(c.puesto_id)));
                  const txtDias = maxLead === 1 ? "el día siguiente" : `en ${maxLead} días`;
                  const tiendasPorEncargo = Array.from(new Set(conLead.map((c) => c.puesto_nombre))).join(", ");
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                      <p className="text-sm font-bold text-amber-900 mb-1">⚠️ Tu lista mezcla tiempos de entrega</p>
                      <p className="text-xs text-amber-800 mb-2">
                        Tienes productos por encargo de <strong>{tiendasPorEncargo}</strong> (entrega {txtDias}) junto con productos de entrega inmediata. Si dejas todo, el pedido completo se programa para {txtDias}.
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => {
                            setCarrito((prev) => prev.filter((c) => leadDeItem(c.puesto_id) === 0));
                          }}
                          className="w-full py-2 bg-white border border-amber-300 text-amber-800 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                        >
                          Quitar productos por encargo (entrega hoy lo demás)
                        </button>
                        <button
                          onClick={() => {
                            setCarrito((prev) => prev.filter((c) => leadDeItem(c.puesto_id) > 0));
                          }}
                          className="w-full py-2 bg-white border border-amber-300 text-amber-800 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                        >
                          Quitar productos inmediatos (solo me llevo lo de encargo)
                        </button>
                        <p className="text-[11px] text-amber-700 text-center mt-1">
                          O sigue con la lista mezclada y todo se entrega {txtDias}.
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {carrito.map((item) => (
                    <div
                      key={`${item.producto_id}-${item.puesto_id}`}
                      className="bg-white rounded-xl p-3 shadow-sm"
                    >
                      {/* Bloque info — nombre a ancho completo, ✕ arriba a la
                          derecha. Antes los controles compartían fila con el
                          nombre y le robaban ~50% del ancho en pantallas
                          chicas; quedaba truncado. Ahora el nombre tiene toda
                          la fila para sí mismo. */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-800 leading-tight line-clamp-2">{item.producto_nombre}</h4>
                          {(item.variante_nombre || (item.modificadores && item.modificadores.length > 0)) && (
                            <p className="text-[11px] text-brand-dark leading-tight mt-0.5">
                              {[item.variante_nombre, ...(item.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {item.puesto_nombre} &bull; ${item.precio_unitario}/{item.unidad}
                          </p>
                          {item.precio_mayoreo != null && item.mayoreo_desde != null && (
                            item.cantidad >= item.mayoreo_desde ? (
                              <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 inline-block">
                                ✓ Mayoreo aplicado (${item.precio_mayoreo}/{unidadFormato(item.unidad, 1)})
                              </p>
                            ) : (
                              <p className="text-[11px] text-amber-600 mt-1">
                                Agrega {item.mayoreo_desde - item.cantidad} {unidadFormato(item.unidad, (item.mayoreo_desde ?? 0) - item.cantidad)} más para mayoreo (${item.precio_mayoreo}/{unidadFormato(item.unidad, 1)})
                              </p>
                            )
                          )}
                          {item.puesto_ubicacion && (
                            <p className="text-xs text-gray-300 leading-tight mt-0.5">{item.puesto_ubicacion}</p>
                          )}
                        </div>
                        <button
                          onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), -item.cantidad)}
                          aria-label="Quitar del carrito"
                          className="w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-red-100 active:scale-90 transition-transform"
                        >
                          <span className="text-lg leading-none">×</span>
                        </button>
                      </div>
                      {/* Bloque acción — qty controls + subtotal en su propia
                          fila. Espacio libre en el centro para que respire. */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), -1)}
                            className="w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold flex items-center justify-center active:scale-90 transition-transform"
                            aria-label="Restar"
                          >
                            −
                          </button>
                          <span className="font-bold w-6 text-center">{item.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), 1)}
                            className="w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold flex items-center justify-center active:scale-90 transition-transform"
                            aria-label="Sumar"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-black text-navy text-lg">
                          ${item.subtotal.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="bg-white rounded-xl p-4 shadow-sm mt-4">
                  <div className="flex justify-between text-gray-600 mb-1">
                    <span>Productos ({carrito.length})</span>
                    <span className="font-medium">
                      {promocionMayoreo > 0 ? (
                        <>
                          <span className="text-gray-400 line-through mr-1">${(subtotal + promocionMayoreo).toFixed(2)}</span>
                          ${subtotal.toFixed(2)}
                        </>
                      ) : (
                        `$${subtotal.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  {promocionMayoreo > 0 && (
                    <div className="flex justify-between mb-1">
                      <span className="text-green-600 font-medium">🎉 Ahorro por mayoreo</span>
                      <span className="text-green-600 font-bold">-${promocionMayoreo.toFixed(2)}</span>
                    </div>
                  )}
                  {servicioMercadito > 0 && (
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Servicio Mercadito</span>
                      <span className="font-medium">${servicioMercadito.toFixed(2)}</span>
                    </div>
                  )}
                  {costoEnvio > 0 && (
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Envío ({zonaEnvio})</span>
                      <span className="font-medium">${costoEnvio.toFixed(2)}</span>
                    </div>
                  )}
                  {recargoTarjeta > 0 && (
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Recargo tarjeta</span>
                      <span className="font-medium">${recargoTarjeta.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span className="text-navy">${total.toFixed(2)}</span>
                  </div>
                </div>

              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: MIS PEDIDOS ══════════════ */}
        {tab === "pedidos" && (
          <div className="mt-4">
            {!usuario ? (
              <ClienteLogin onLoggedIn={() => fetchMisPedidos()} />
            ) : (
              <>
                {/* User info bar */}
                <div className="bg-white rounded-xl p-3 shadow-sm mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-700">{usuario.nombre}</p>
                    <p className="text-xs text-gray-400">{usuario.telefono}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPinManager(true)}
                      className="text-xs text-brand-dark bg-brand-light px-3 py-1 rounded-full font-medium"
                      title="Configurar PIN"
                    >
                      🔒 PIN
                    </button>
                    <button
                      onClick={logout}
                      className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>

                {loadingPedidos ? (
              <div className="text-center py-12 text-gray-400">Cargando pedidos...</div>
            ) : misPedidos.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-400">No tienes pedidos todavia</p>
                <button
                  onClick={() => setTab("comprar")}
                  className="text-brand-dark font-bold mt-2"
                >
                  Ir a comprar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {misPedidos.map((pedido) => {
                  const colores: Record<string, { color: string; icon: string }> = {
                    pendiente: { color: "bg-yellow-100 text-yellow-800", icon: "⏳" },
                    en_compra: { color: "bg-blue-100 text-blue-800", icon: pedido.tipo === "envio" ? "📦" : "🛒" },
                    en_camino: { color: "bg-purple-100 text-purple-800", icon: "🛵" },
                    entregado: { color: "bg-green-100 text-green-800", icon: "✅" },
                    cancelado: { color: "bg-red-100 text-red-800", icon: "❌" },
                  };
                  const labelLargo = pedido.estado === "en_compra" && pedido.tipo !== "envio"
                    ? "Comprando tus productos"
                    : labelEstado(pedido.estado, pedido.tipo ?? "mercado");
                  const info = { label: labelLargo, ...(colores[pedido.estado] || colores.pendiente) };
                  const canCancel = pedido.estado === "pendiente";

                  return (
                    <div key={pedido.id} className={`bg-white rounded-xl p-4 shadow-sm ${pedido.estado === "cancelado" ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl">{info.icon}</span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${info.color}`}>
                            {info.label}
                          </span>
                          {pedido.tipo === "envio" && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-800">
                              📦 Envío
                            </span>
                          )}
                          {pedido.metodo_pago === "transferencia" && !pedido.pago_validado_at && pedido.estado !== "cancelado" && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-800">
                              🏦 Esperando validacion
                            </span>
                          )}
                          {pedido.agendado_para && pedido.estado !== "cancelado" && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-800">
                              📅 Agendado {new Date(pedido.agendado_para).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-navy">${pedido.total.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs text-gray-400">
                          {new Date(pedido.created_at).toLocaleString("es-MX")} &bull; #{pedido.id.slice(0, 8).toUpperCase()}
                        </p>
                        <button
                          onClick={() => setTicketPedido(pedido.id)}
                          className="text-xs bg-brand-light text-brand-dark px-2.5 py-1 rounded-full font-bold active:scale-95 transition-transform shrink-0"
                        >
                          🧾 Ver ticket
                        </button>
                      </div>

                      {/* Repartidor: el del pedido si ya se asignó, si no el
                          "de turno" para que el cliente pueda contactar desde
                          el momento de la compra. */}
                      {pedido.estado !== "cancelado" && (() => {
                        const nombre = pedido.repartidor_nombre || pedido.repartidor_default?.nombre;
                        const tel = pedido.repartidor_telefono || pedido.repartidor_default?.telefono;
                        if (!nombre) return null;
                        const telLimpio = (tel || "").replace(/\D/g, "");
                        const sinAsignar = !pedido.repartidor_nombre;
                        return (
                          <div className="bg-amber-50 rounded-lg p-2.5 mb-2">
                            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">
                              🛵 Tu repartidor{sinAsignar ? " (de turno)" : ""}
                            </p>
                            <p className="text-sm font-bold text-gray-800 mt-0.5">{nombre}</p>
                            {tel && (
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-gray-600">📱 {tel}</span>
                                <a
                                  href={`https://wa.me/52${telLimpio}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"
                                >
                                  WhatsApp
                                </a>
                                <a
                                  href={`tel:${tel}`}
                                  className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium"
                                >
                                  Llamar
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Envío: mostrar info de paquete (sin items) */}
                      {pedido.tipo === "envio" && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 space-y-1.5 text-xs">
                          <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">📦 Envío de paquete</p>
                          {pedido.peso_kg != null && <p><span className="text-gray-500">Peso:</span> <span className="font-medium">{Number(pedido.peso_kg).toFixed(1)} kg</span></p>}
                          {pedido.descripcion_contenido && <p><span className="text-gray-500">Contenido:</span> <span className="font-medium">{pedido.descripcion_contenido}</span></p>}
                          {pedido.recogida_nombre && <p><span className="text-gray-500">Envía:</span> <span className="font-medium">{pedido.recogida_nombre}</span> {pedido.recogida_telefono && <span className="text-gray-400">· {pedido.recogida_telefono}</span>}</p>}
                          {pedido.direccion_recogida && <p><span className="text-gray-500">Recoger en:</span> <span className="font-medium">{pedido.direccion_recogida.split("[")[0].trim()}</span></p>}
                        </div>
                      )}

                      {/* Items — show editor or read-only (solo para mercado) */}
                      {pedido.tipo !== "envio" && editandoPedido === pedido.id ? (
                        <EditorPedido
                          pedidoId={pedido.id}
                          items={pedido.items}
                          editadoPor={`cliente ${usuario?.nombre || ""}`}
                          modoCliente
                          onSaved={() => { setEditandoPedido(null); fetchMisPedidos(); }}
                          onCancel={() => setEditandoPedido(null)}
                        />
                      ) : pedido.tipo !== "envio" ? (
                        <>
                          <div className="bg-gray-50 rounded-lg p-3 mb-3">
                            {pedido.items.map((item) => (
                              <div key={item.id} className="py-0.5">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">
                                    {item.cantidad} {item.unidad} {item.producto_nombre}
                                    {item.manual && (
                                      <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">✏️ Sustitución</span>
                                    )}
                                  </span>
                                  <span className="text-gray-500">${item.subtotal.toFixed(2)}</span>
                                </div>
                                {(item.variante_nombre || (item.modificadores && item.modificadores.length > 0)) && (
                                  <p className="text-[11px] text-brand-dark pl-2 leading-tight">
                                    {[item.variante_nombre, ...(item.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                            ))}
                            {(() => {
                              const servicio = pedido.items.reduce((s, it) => s + it.cantidad * (Number(it.comision) || 0), 0);
                              return servicio > 0 ? (
                                <div className="border-t mt-1 pt-1 flex justify-between text-sm">
                                  <span className="text-gray-500">Servicio Mercadito</span>
                                  <span className="text-gray-500">${servicio.toFixed(2)}</span>
                                </div>
                              ) : null;
                            })()}
                            <div className="border-t mt-1 pt-1 flex justify-between text-sm">
                              <span className="text-gray-500">Envio</span>
                              <span className="text-gray-500">${pedido.costo_envio.toFixed(2)}</span>
                            </div>
                            {pedido.editado_por && (
                              <div className="border-t mt-1 pt-1">
                                <p className="text-xs text-amber-600">
                                  Editado por {pedido.editado_por}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Edit & Cancel buttons for pending orders */}
                          {canCancel && (
                            <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => setEditandoPedido(pedido.id)}
                                className="flex-1 py-2 border-2 border-amber-400 text-amber-700 rounded-lg font-medium text-sm active:scale-95 transition-transform"
                              >
                                Editar pedido
                              </button>
                              <button
                                onClick={() => cancelarPedido(pedido.id)}
                                className="flex-1 py-2 border-2 border-red-300 text-red-600 rounded-lg font-medium text-sm active:scale-95 transition-transform"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}

                          {/* Volver a comprar — útil para repedir lo de la
                              semana pasada de un toque. */}
                          {(pedido.estado === "entregado" || pedido.estado === "cancelado") && (
                            <button
                              onClick={() => volverAComprar(pedido)}
                              className="w-full py-2 bg-brand-light text-brand-dark rounded-lg font-bold text-sm active:scale-95 transition-transform mb-2"
                            >
                              🔁 Volver a comprar
                            </button>
                          )}

                          {/* Calificar al repartidor — solo en entregados. */}
                          {pedido.estado === "entregado" && (
                            <CalificarRepartidor
                              pedido={pedido}
                              onSaved={fetchMisPedidos}
                            />
                          )}
                        </>
                      ) : null}

                      {/* Calificar repartidor también para envíos entregados */}
                      {pedido.tipo === "envio" && pedido.estado === "entregado" && (
                        <CalificarRepartidor pedido={pedido} onSaved={fetchMisPedidos} />
                      )}

                      {pedido.estado === "en_compra" && (
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-blue-700 font-medium">
                            {pedido.tipo === "envio"
                              ? "El repartidor va a recoger tu paquete. Si necesitas avisar algo, llámalo."
                              : "Ya estan comprando tus productos. Si necesitas cambiar algo, llama al repartidor."}
                          </p>
                        </div>
                      )}

                      {pedido.estado === "en_camino" && (
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-purple-700 font-medium">
                            {pedido.tipo === "envio" ? "Tu paquete va en camino al destinatario" : "Tu pedido va en camino"}
                          </p>
                        </div>
                      )}

                      {/* Live tracking del repartidor: si está activo y la
                          ubicación es reciente (≤15 min), mostramos mini
                          mapa con su posición + tiendas + casa del cliente.
                          Es información de tránsito, no precisa al metro. */}
                      {(pedido.estado === "en_compra" || pedido.estado === "en_camino") &&
                        pedido.repartidor_lat != null && pedido.repartidor_lng != null &&
                        pedido.repartidor_ubicacion_at &&
                        (Date.now() - new Date(pedido.repartidor_ubicacion_at).getTime()) < 15 * 60 * 1000 &&
                        (() => {
                          // Reusar parser de dirección y armar paradas a partir
                          // de items (mismas coords del repartidor view).
                          const dir = (() => {
                            const m = pedido.direccion_entrega.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
                            if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
                            return null;
                          })();
                          if (!dir) return null;
                          const vistos = new Set<string>();
                          const paradas: { lat: number; lng: number; nombre: string }[] = [];
                          for (const it of pedido.items) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const x = it as any;
                            if (vistos.has(it.puesto_id)) continue;
                            vistos.add(it.puesto_id);
                            const la = x.puesto_lat != null ? Number(x.puesto_lat) : null;
                            const ln = x.puesto_lng != null ? Number(x.puesto_lng) : null;
                            if (la == null || ln == null || Number.isNaN(la) || Number.isNaN(ln)) continue;
                            paradas.push({ lat: la, lng: ln, nombre: it.puesto_nombre || it.puesto_id });
                          }
                          const minutos = Math.max(0, Math.round((Date.now() - new Date(pedido.repartidor_ubicacion_at!).getTime()) / 60000));
                          return (
                            <div className="mt-2">
                              <p className="text-[11px] text-gray-500 mb-1">
                                🛵 {pedido.repartidor_nombre || "Tu repartidor"} · ubicación hace {minutos} min
                              </p>
                              <MapaPedido
                                lat={dir.lat}
                                lng={dir.lng}
                                direccion={pedido.direccion_entrega}
                                paradas={paradas}
                                origen={{ lat: pedido.repartidor_lat!, lng: pedido.repartidor_lng! }}
                              />
                            </div>
                          );
                        })()}

                      {pedido.estado === "cancelado" && pedido.motivo_cancelacion && (
                        <div className="bg-red-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-red-600">Motivo: {pedido.motivo_cancelacion}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={fetchMisPedidos}
                  className="w-full py-3 border-2 border-brand text-brand-dark rounded-full font-medium active:scale-95 transition-transform"
                >
                  Actualizar
                </button>

                {/* Soporte / reportar problema. El cliente está logueado aquí
                    (por eso vemos misPedidos), así que precargamos sus datos. */}
                <div className="mt-6 pt-6 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Soporte</p>
                  <a
                    href={`https://wa.me/5215659163241?text=${encodeURIComponent(
                      `Hola, tengo un problema con Mercadito\n` +
                      `• App: Web\n` +
                      (usuario ? `• Mi tel: ${usuario.telefono}\n` : "") +
                      (usuario?.nombre ? `• Nombre: ${usuario.nombre}\n` : "") +
                      `\nLo que pasó:\n`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-white rounded-xl active:scale-95 transition-transform"
                  >
                    <span className="text-xl">🐛</span>
                    <span className="font-medium text-gray-700 text-sm">Reportar un problema</span>
                    <span className="ml-auto text-gray-300">›</span>
                  </a>
                  <a
                    href={`https://wa.me/5215659163241?text=${encodeURIComponent("Hola Mercadito, necesito ayuda")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-white rounded-xl active:scale-95 transition-transform"
                  >
                    <span className="text-xl">💬</span>
                    <span className="font-medium text-gray-700 text-sm">Contactar soporte</span>
                    <span className="ml-auto text-gray-300">›</span>
                  </a>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: ENTREGA ══════════════ */}
        {tab === "entregar" && (
          <div className="mt-4 space-y-4">
            {/* Map */}
            <div>
              <h3 className="font-bold text-gray-700 mb-2">¿Dónde te entregamos?</h3>
              {!ubicacion && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-center">
                  <p className="text-sm text-blue-700">
                    Marca tu ubicacion para calcular el costo de envio
                  </p>
                </div>
              )}
              <MapaEntrega
                ubicacionInicial={ubicacion}
                origenes={tiendasOrigen}
                onUbicacionSeleccionada={handleUbicacionSeleccionada}
                onDireccionDetectada={handleDireccionDetectada}
              />
            </div>

            {/* Contact info */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-700">Tus datos</h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Tu nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: María García"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Teléfono / WhatsApp</label>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="353 123 4567"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Dirección de entrega</label>
                {direccion ? (
                  <p className="bg-gray-100 rounded-lg px-4 py-3 text-gray-700">{direccion}</p>
                ) : (
                  <p className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700">
                    Toca el mapa o usa &quot;Mi ubicacion&quot; para obtener tu direccion
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">No. de casa o apartamento</label>
                <input
                  type="text"
                  value={numeroCasa}
                  onChange={(e) => setNumeroCasa(e.target.value)}
                  placeholder="Ej: #42, Int. 3, Casa azul..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  ¿Cuándo lo quieres?
                </label>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {/* "Ahora" solo si todas las tiendas están abiertas a esta hora. */}
                  {ahoraDisponible && (
                    <button
                      type="button"
                      onClick={() => setAgendadoIso(null)}
                      className={`flex-shrink-0 px-3 py-2 rounded-xl text-left transition-colors min-w-[140px] ${
                        agendadoIso === null
                          ? "bg-brand text-white shadow-sm"
                          : "bg-white border border-gray-200 text-gray-600"
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">🛵 Ahora</p>
                      <p className={`text-[10px] mt-0.5 ${agendadoIso === null ? "text-white/80" : "text-gray-400"}`}>
                        lo antes posible
                      </p>
                    </button>
                  )}
                  {ventanasOpciones.map((v) => (
                    <button
                      key={v.inicio}
                      type="button"
                      onClick={() => setAgendadoIso(v.inicio)}
                      className={`flex-shrink-0 px-3 py-2 rounded-xl text-left transition-colors min-w-[140px] ${
                        agendadoIso === v.inicio
                          ? "bg-brand text-white shadow-sm"
                          : "bg-white border border-gray-200 text-gray-600"
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">📅 {v.label}</p>
                      <p className={`text-[10px] mt-0.5 ${agendadoIso === v.inicio ? "text-white/80" : "text-gray-400"}`}>
                        ventana válida
                      </p>
                    </button>
                  ))}
                </div>

                {!ahoraDisponible && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mt-2">
                    ⚠️ Hay tiendas en tu carrito que no están abiertas ahora. Solo puedes agendar para una hora donde TODAS abran. Las opciones arriba ya están filtradas para ti.
                  </p>
                )}
                {agendadoIso && (() => {
                  const f = new Date(agendadoIso);
                  const fmt = f.toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
                  return (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mt-2">
                      📅 Tu pedido se agenda para <strong>{fmt}</strong>. El repartidor lo verá con anticipación. Puedes cancelar hasta que confirme que va a comprarlo.
                    </p>
                  );
                })()}
                {ventanasOpciones.length === 0 && !ahoraDisponible && (
                  <p className="text-[11px] text-red-700 bg-red-50 rounded-lg p-2 mt-2">
                    No encontramos un horario común para todas las tiendas de tu carrito en los próximos días. Quita alguna tienda y vuelve a intentar.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Notas <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Que el tomate esté rojo, prefiero manzana verde..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                />
              </div>
            </div>

            {/* Order summary */}
            {carrito.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-2">Resumen de tu pedido</h3>
                {carrito.map((item) => (
                  <div key={`${item.producto_id}-${item.puesto_id}`} className="flex justify-between text-sm py-1 text-gray-600">
                    <span>{item.cantidad} {item.unidad} {item.producto_nombre}</span>
                    <span>${item.subtotal.toFixed(0)}</span>
                  </div>
                ))}
                {/* Payment method */}
                <div className="border-t mt-2 pt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Metodo de pago</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPago("efectivo")}
                      className={`rounded-xl p-3 text-center border-2 transition-colors ${
                        metodoPago === "efectivo"
                          ? "border-brand bg-brand-light"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <span className="text-2xl block">💵</span>
                      <span className="text-xs font-medium text-gray-700">Efectivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago("transferencia")}
                      className={`rounded-xl p-3 text-center border-2 transition-colors ${
                        metodoPago === "transferencia"
                          ? "border-brand bg-brand-light"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <span className="text-2xl block">🏦</span>
                      <span className="text-xs font-medium text-gray-700">Transferencia</span>
                      <span className="block text-[10px] text-gray-400">SPEI</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago("tarjeta")}
                      className={`rounded-xl p-3 text-center border-2 transition-colors ${
                        metodoPago === "tarjeta"
                          ? "border-brand bg-brand-light"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <span className="text-2xl block">💳</span>
                      <span className="text-xs font-medium text-gray-700">Tarjeta</span>
                      <span className="block text-[10px] text-gray-400">Debito / Credito</span>
                    </button>
                  </div>
                  {metodoPago === "tarjeta" && (
                    <p className="text-xs text-gray-400 mt-1.5 text-center">
                      El repartidor lleva terminal. Se aplica recargo del 4% por comision bancaria.
                    </p>
                  )}
                  {metodoPago === "transferencia" && (() => {
                    const datos = datosPagoConPedido("");
                    async function copiarClabe() {
                      try {
                        await navigator.clipboard?.writeText(datos.clabe);
                        setClabeCopiada(true);
                        setTimeout(() => setClabeCopiada(false), 2000);
                      } catch {
                        alert("No se pudo copiar. Selecciona manualmente: " + datos.clabe);
                      }
                    }
                    async function copiarDimo() {
                      try {
                        await navigator.clipboard?.writeText(datos.dimo.telefono);
                        setDimoCopiado(true);
                        setTimeout(() => setDimoCopiado(false), 2000);
                      } catch {
                        alert("No se pudo copiar. Selecciona manualmente: " + datos.dimo.telefono);
                      }
                    }
                    return (
                      <div className="mt-3 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-bold text-blue-900">Paga por transferencia (SPEI):</p>

                        {/* DiMo — opción rápida con teléfono */}
                        <div className="bg-white rounded-lg p-3 space-y-2 border-2 border-green-200">
                          <div className="flex items-center gap-2">
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">RECOMENDADO</span>
                            <span className="text-sm font-bold text-gray-800">📱 DiMo (más fácil)</span>
                          </div>
                          <p className="text-xs text-gray-500 leading-snug">
                            Desde tu app del banco: busca <strong>&quot;DiMo&quot;</strong> o <strong>&quot;Enviar a número&quot;</strong> y mete este teléfono.
                          </p>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-gray-500">Teléfono DiMo</span>
                              <button
                                type="button"
                                onClick={copiarDimo}
                                className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition-colors ${dimoCopiado ? "bg-green-100 text-green-700" : "bg-brand-light text-brand-dark active:scale-95"}`}
                              >
                                {dimoCopiado ? "✓ Copiado" : "📋 Copiar"}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={copiarDimo}
                              className="w-full text-left font-mono font-bold text-lg text-gray-800 tracking-wider select-all"
                            >
                              {datos.dimo.telefono}
                            </button>
                          </div>
                          <div className="flex justify-between items-center text-xs gap-2">
                            <span className="text-gray-500 shrink-0">Banco</span>
                            <span className="font-bold text-gray-800 text-right truncate">{datos.dimo.banco}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-gray-500 block">A nombre de</span>
                            <span className="font-bold text-gray-800 break-words leading-tight">{datos.dimo.titular}</span>
                          </div>
                          <div className="flex justify-between items-center border-t pt-2">
                            <span className="text-xs text-gray-500">Monto a transferir</span>
                            <span className="font-bold text-brand-dark text-lg">${total.toFixed(2)}</span>
                          </div>
                        </div>

                        <p className="text-center text-xs text-gray-500">— o también por CLABE —</p>

                        <div className="bg-white rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-xs text-gray-500 shrink-0">Banco</span>
                            <span className="font-bold text-gray-800 text-right truncate">{datos.banco}</span>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-gray-500">CLABE</span>
                              <button
                                type="button"
                                onClick={copiarClabe}
                                className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition-colors ${clabeCopiada ? "bg-green-100 text-green-700" : "bg-brand-light text-brand-dark active:scale-95"}`}
                              >
                                {clabeCopiada ? "✓ Copiada" : "📋 Copiar"}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={copiarClabe}
                              className="w-full text-left font-mono font-bold text-base text-gray-800 tracking-wider select-all"
                            >
                              {datos.clabe}
                            </button>
                          </div>
                          {/* "A nombre de" envuelto en text-xs para empatar
                              tamaño con la card de DiMo (antes el nombre
                              se renderizaba a 16px en CLABE y 12px en DiMo;
                              se veían distintos sin razón). */}
                          <div className="text-xs">
                            <span className="text-gray-500 block">A nombre de</span>
                            <span className="font-bold text-gray-800 break-words leading-tight">{datos.beneficiario}</span>
                          </div>
                          <div className="flex justify-between items-center border-t pt-2">
                            <span className="text-xs text-gray-500">Monto a transferir</span>
                            <span className="font-bold text-brand-dark text-lg">${total.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Botón comprobante grande */}
                        {comprobantePago ? (
                          <div className="bg-white rounded-lg p-2 flex items-center gap-3 border-2 border-green-300">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={comprobantePago} alt="Comprobante" className="w-16 h-16 object-cover rounded" />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-green-700">✓ Comprobante listo</p>
                              <p className="text-xs text-gray-500">Validaremos al recibir el pedido</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setComprobantePago(null)}
                              className="text-xs text-red-600 underline px-2"
                            >Cambiar</button>
                          </div>
                        ) : (
                          <label className="block bg-brand text-white rounded-xl p-4 text-center cursor-pointer active:scale-95 transition-transform shadow-md">
                            <span className="text-2xl block mb-1">📸</span>
                            <span className="font-bold text-base">Subir comprobante de pago</span>
                            <span className="block text-xs opacity-80 mt-0.5">Sin comprobante no podemos validar tu pago</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                if (f.size > 5 * 1024 * 1024) { alert("La imagen es muy grande (max 5MB)"); return; }
                                const reader = new FileReader();
                                reader.onload = () => setComprobantePago(reader.result as string);
                                reader.readAsDataURL(f);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="border-t mt-2 pt-2 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Productos</span>
                    <span>
                      {promocionMayoreo > 0 ? (
                        <>
                          <span className="text-gray-400 line-through mr-1">${(subtotal + promocionMayoreo).toFixed(2)}</span>
                          ${subtotal.toFixed(2)}
                        </>
                      ) : (
                        `$${subtotal.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  {promocionMayoreo > 0 && (
                    <div className="flex justify-between">
                      <span className="text-green-600 font-medium">🎉 Ahorro por mayoreo</span>
                      <span className="text-green-600 font-bold">-${promocionMayoreo.toFixed(2)}</span>
                    </div>
                  )}
                  {servicioMercadito > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Servicio Mercadito</span>
                      <span>${servicioMercadito.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Envio</span>
                    <span>{costoEnvio > 0 ? `$${costoEnvio.toFixed(2)}` : "Selecciona ubicacion"}</span>
                  </div>
                  {recargoTarjeta > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Comision tarjeta (4%)</span>
                      <span>+${recargoTarjeta.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold pt-1 border-t">
                    <span>Total</span>
                    <span className="text-navy">${total.toFixed(2)}</span>
                  </div>
                  {tiempoEnvio && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      Tiempo estimado: {tiempoEnvio} &bull; Pago {metodoPago === "tarjeta" ? "con tarjeta" : "en efectivo"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Business hours & Submit */}
            {(() => {
              const horario = getHorarioInfo();
              const recargoNocturno = horario.recargoNocturno;
              const totalConRecargo = total + recargoNocturno; // total already includes card surcharge
              return (
                <>
                  {!horario.abierto && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                      <span className="text-3xl block mb-2">🌙</span>
                      <p className="text-sm text-red-700 font-medium">
                        Estamos cerrados por hoy
                      </p>
                      <p className="text-xs text-red-500 mt-1">
                        Nuestro horario es de 8:00 AM a 11:00 PM
                      </p>
                      <p className="text-xs text-red-400 mt-1">
                        De 10:00 PM a 11:00 PM con recargo de $30 por entrega nocturna
                      </p>
                    </div>
                  )}

                  {horario.esNocturno && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">🌙</span>
                        <span className="font-bold text-amber-800">Horario nocturno</span>
                      </div>
                      <p className="text-sm text-amber-700">
                        Estamos fuera de nuestro horario normal. Tu pedido tiene un <strong>recargo de ${recargoNocturno}</strong> por entrega nocturna.
                      </p>
                      <div className="mt-2 bg-white rounded-lg p-2 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Envio normal</span>
                          <span>${costoEnvio.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-amber-700">
                          <span>Recargo nocturno</span>
                          <span>+${recargoNocturno.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-1 mt-1">
                          <span>Total a pagar</span>
                          <span className="text-navy">${totalConRecargo.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={verificarYEnviar}
                    disabled={!horario.abierto || enviando || carrito.length === 0 || !ubicacion || costoEnvio === 0 || !nombre || !telefono || !direccion || !numeroCasa || (metodoPago === "transferencia" && !comprobantePago)}
                    className="w-full bg-brand text-white py-4 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform shadow-lg"
                  >
                    {!horario.abierto
                      ? "Cerrado — vuelve de 8 AM a 11 PM"
                      : enviando
                      ? "Verificando precios..."
                      : carrito.length === 0
                      ? "Agrega productos primero"
                      : !nombre || !telefono
                      ? "Llena tu nombre y teléfono"
                      : !ubicacion || !direccion
                      ? "Marca tu ubicacion en el mapa"
                      : !numeroCasa
                      ? "Escribe tu no. de casa"
                      : metodoPago === "transferencia" && !comprobantePago
                      ? "Sube tu comprobante de transferencia"
                      : horario.esNocturno
                      ? `Confirmar Pedido — $${totalConRecargo.toFixed(2)} (inc. recargo nocturno)`
                      : `Confirmar Pedido — $${total.toFixed(2)}`}
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* Modal: Selector de variante/modificadores */}
      {varianteModal && (
        <ProductoVarianteModal
          producto={varianteModal.producto}
          precio={varianteModal.precio}
          onClose={() => setVarianteModal(null)}
          onAgregar={({ variante, modificadores, cantidadInicial }) => {
            agregarAlCarrito(
              varianteModal.producto,
              {
                puesto_id: varianteModal.precio.puesto_id,
                puesto_nombre: varianteModal.precio.puesto_nombre,
                precio: Number(varianteModal.precio.precio),
                precio_mayoreo: varianteModal.precio.precio_mayoreo ?? null,
                mayoreo_desde: varianteModal.precio.mayoreo_desde ?? null,
                puesto_ubicacion: varianteModal.precio.puesto_ubicacion,
              },
              { variante, modificadores, cantidadInicial }
            );
          }}
        />
      )}

      {/* Modal: Price changes detected */}
      {cambiosPrecio && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Precios actualizados</h3>
            <p className="text-sm text-gray-500 mb-4">
              Algunos precios cambiaron desde que agregaste los productos:
            </p>

            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {cambiosPrecio.map((c, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <p className="font-medium text-gray-700 text-sm">{c.producto}</p>
                  <p className="text-xs text-gray-400">{c.tienda}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-400 line-through">${c.antes}</span>
                    <span className="text-sm">→</span>
                    <span className={`text-sm font-bold ${c.diff > 0 ? "text-red-600" : "text-brand-dark"}`}>
                      ${c.ahora}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.diff > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-brand-dark"}`}>
                      {c.diff > 0 ? "+" : ""}{c.diff.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 mb-4">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Nuevo subtotal</span>
                <span className="font-bold text-gray-700">${nuevoSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Envio</span>
                <span>${costoEnvio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold mt-1 pt-1 border-t">
                <span>Total</span>
                <span className="text-navy">${(nuevoSubtotal + costoEnvio).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCambiosPrecio(null)}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-full font-medium active:scale-95 transition-transform"
              >
                Revisar
              </button>
              <button
                onClick={enviarPedido}
                disabled={enviando}
                className="flex-1 py-3 bg-brand text-white rounded-full font-bold active:scale-95 transition-transform disabled:bg-gray-300"
              >
                {enviando ? "Enviando..." : "Confirmar"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de ticket — abierto desde la pestaña Pedidos. */}
      {ticketPedido && (() => {
        const p = misPedidos.find((x) => x.id === ticketPedido);
        if (!p) return null;
        return <TicketPedido pedido={p} onClose={() => setTicketPedido(null)} />;
      })()}

      {/* Modal de configuración de PIN. */}
      {showPinManager && <PinManager onClose={() => setShowPinManager(false)} />}

      {/* Modal de envío de paquete. */}
      <EnvioModal
        abierto={mostrarEnvio}
        onClose={() => setMostrarEnvio(false)}
        onCreado={() => {
          setMostrarEnvio(false);
          setTab("pedidos");
          fetchMisPedidos();
        }}
        // Solo precargamos si hay sesión confirmada. Sin login, el cliente
        // teclea de cero — evita asumir que el nombre/teléfono del checkout
        // sea quien manda el paquete (puede ser otra persona).
        usuarioNombre={usuario?.nombre}
        usuarioTelefono={usuario?.telefono}
      />

      {/* Sheet Ordenar — selección exclusiva (radio). "Solo mayoreo" se
          movió al sheet de Filtros porque recorta la lista (es filtro, no
          orden). "Distancia" requiere ubicación del cliente para calcular
          haversine; sin ubicación queda deshabilitada. */}
      <BottomSheet abierto={sheetOrdenar} onClose={() => setSheetOrdenar(false)} titulo="Ordenar">
        <div className="space-y-1" role="radiogroup" aria-label="Ordenar resultados">
          {([
            { id: "default",   label: "Recomendado",       desc: "Agrupa productos similares y muestra el más barato primero" },
            { id: "tiempo",    label: "Tiempo de entrega", desc: "Lo que llega más rápido, primero" },
            { id: "distancia", label: "Distancia",         desc: "Tiendas más cercanas a tu ubicación" },
            { id: "menor",     label: "Menor precio",      desc: "Más baratos arriba" },
            { id: "mayor",     label: "Mayor precio",      desc: "Más caros arriba" },
          ] as const).map((opt) => {
            const disabled = opt.id === "distancia" && !ubicacion;
            const selected = ordenFiltro === opt.id;
            return (
              <button
                key={opt.id}
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => { if (!disabled) { setOrdenFiltro(opt.id); setSheetOrdenar(false); } }}
                className={`w-full text-left p-3 rounded-xl border-2 transition-colors flex items-start gap-3 ${
                  selected
                    ? "border-brand bg-brand-light"
                    : "border-gray-100 bg-white"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selected ? "border-brand" : "border-gray-300"
                }`}>
                  {selected && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </span>
                <span className="flex-1">
                  <p className="font-bold text-gray-800 text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-500">
                    {disabled ? "Activa tu ubicación para usar esta opción" : opt.desc}
                  </p>
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Sheet Más categorías */}
      <BottomSheet abierto={sheetCategorias} onClose={() => setSheetCategorias(false)} titulo="Todas las categorías">
        <div className="grid grid-cols-3 gap-2">
          {categoriasOrdenadas.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategoriaActual(cat.id);
                setTiendaFiltro(null);
                setSeccionFiltro(null); setSubseccionFiltro(null);
                fetchTiendasCategoria(cat.id);
                setSheetCategorias(false);
              }}
              className="bg-white rounded-xl py-3 px-2 flex flex-col items-center gap-1 active:scale-95 transition-transform border border-gray-100"
            >
              <span className="text-2xl">{cat.icono}</span>
              <span className="font-medium text-[11px] text-gray-700 text-center leading-tight">{cat.nombre}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Sheet Filtros — sección/subsección + toggle Solo mayoreo. El CTA
          muestra el conteo de resultados en vivo para que el cliente sepa
          si vale la pena cerrar el sheet o seguir ajustando. */}
      <BottomSheet
        abierto={sheetFiltros}
        onClose={() => setSheetFiltros(false)}
        titulo="Filtros"
        footer={
          <button
            onClick={() => setSheetFiltros(false)}
            className="w-full bg-brand text-white py-3 rounded-full font-bold"
          >
            Ver resultados ({ofertasFiltradas.length})
          </button>
        }
      >
        <div className="space-y-5">
          {seccionesDisponibles.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 mb-2">Sección</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { setSeccionFiltro(null); setSubseccionFiltro(null); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    !seccionFiltro ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                  }`}
                >
                  Todas
                </button>
                {seccionesDisponibles.map((sec) => (
                  <button
                    key={sec}
                    onClick={() => { setSeccionFiltro(seccionFiltro === sec ? null : sec); setSubseccionFiltro(null); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      seccionFiltro === sec ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            </div>
          )}

          {subseccionesDisponibles.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 mb-2">Subsección</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSubseccionFiltro(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    !subseccionFiltro ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                  }`}
                >
                  Todas
                </button>
                {subseccionesDisponibles.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSubseccionFiltro(subseccionFiltro === sub ? null : sub)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      subseccionFiltro === sub ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Promociones</p>
            <button
              onClick={() => setSoloMayoreo((v) => !v)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-gray-100"
              aria-pressed={soloMayoreo}
            >
              <span className="flex flex-col items-start text-left">
                <span className="font-bold text-gray-800 text-sm">Solo mayoreo</span>
                <span className="text-xs text-gray-500">Productos con precio especial por cantidad</span>
              </span>
              <span className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                soloMayoreo ? "bg-brand" : "bg-gray-300"
              }`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  soloMayoreo ? "translate-x-[22px]" : "translate-x-0.5"
                }`} />
              </span>
            </button>
          </div>

          {seccionesDisponibles.length === 0 && subseccionesDisponibles.length === 0 && (
            <div className="text-center py-4">
              <p className="text-4xl mb-2">🎯</p>
              <p className="font-bold text-sm text-gray-700 mb-1">Esta categoría no tiene secciones</p>
              <p className="text-xs text-gray-500 leading-snug">
                Usa los chips de arriba (Solo abiertas / Inmediato / Ordenar) y los filtros disponibles para acotar los resultados.
              </p>
            </div>
          )}

          {(seccionFiltro || subseccionFiltro || soloMayoreo) && (
            <button
              onClick={() => { setSeccionFiltro(null); setSubseccionFiltro(null); setSoloMayoreo(false); }}
              className="w-full text-sm text-gray-500 underline py-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
