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
import BannerPromoEnvioGratis from "@/components/BannerPromoEnvioGratis";
import CalificarRepartidor from "@/components/CalificarRepartidor";
import PinManager from "@/components/PinManager";
import NotificationBanner from "@/components/NotificationBanner";
import { showNotification, playBeep } from "@/lib/notifications";

const MapaEntrega = dynamic(() => import("@/components/MapaEntrega"), { ssr: false });
const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

type Tab = "comprar" | "carrito" | "entregar" | "pedidos";

function ClienteLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { login } = useSession();
  const [loginNombre, setLoginNombre] = useState("");
  const [loginTelefono, setLoginTelefono] = useState("");
  const [loginPin, setLoginPin] = useState("");
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
    if (!loginTelefono) return;
    if (esClienteNuevo && !loginNombre.trim()) {
      setLoginError("Necesitamos tu nombre para crear tu cuenta");
      return;
    }
    if (esClienteConPin && !loginPin) {
      setLoginError("Escribe tu PIN para entrar");
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

        {/* PIN: obligatorio si el cliente ya lo tiene; opcional para nuevos
            o existentes sin PIN (lo crean si lo escriben). */}
        {(esClienteConPin || esClienteSinPin || esClienteNuevo) && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              🔒 PIN {esClienteConPin
                ? <span className="text-red-500">(obligatorio)</span>
                : <span className="text-gray-400 font-normal">(opcional)</span>}
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={loginPin}
              onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ""))}
              placeholder={esClienteConPin ? "Tu PIN de 4 dígitos" : "Si quieres proteger tus pedidos"}
              className={`w-full border rounded-lg px-4 py-3 text-lg outline-none tracking-widest ${esClienteConPin ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500" : "border-gray-300 focus:border-brand focus:ring-1 focus:ring-brand"}`}
              autoFocus={esClienteConPin}
            />
            {!esClienteConPin && (
              <p className="text-[11px] text-gray-400 mt-1">Si no pones PIN cualquiera con tu teléfono entra. Te lo recomendamos.</p>
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
  // Filtro de orden/precio. Vive aparte del resto para que persista cuando el
  // cliente cambia de tienda, categoría o sección — así si seleccionó "menor
  // precio" sigue ordenado al moverse en el catálogo.
  const [ordenFiltro, setOrdenFiltro] = useState<"default" | "menor" | "mayor" | "mayoreo">("default");
  // Toggle "solo tiendas abiertas ahora" — independiente del orden. Cuando
  // está activo, ocultamos precios con cerrada=true (y si un producto se
  // queda sin precios, no aparece).
  const [soloAbiertas, setSoloAbiertas] = useState(false);
  // Búsqueda por nombre. Independiente de los demás filtros para que persista
  // al cambiar tienda/categoría/sección — si el cliente buscó "tortilla", el
  // filtro lo sigue mientras explora.
  const [busqueda, setBusqueda] = useState("");
  const [tiendasCategoria, setTiendasCategoria] = useState<{ id: string; nombre: string; ubicacion: string | null; lat: number | null; lng: number | null; logo: string | null; categorias: string[]; abierto_ahora?: boolean; horario_atencion?: { dia_semana: number; abre: string | null; cierra: string | null }[] }[]>([]);
  const [todosProductos, setTodosProductos] = useState<ProductoConPrecios[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [loading, setLoading] = useState(true);
  const [anuncios, setAnuncios] = useState<{ id: string; titulo: string; mensaje: string }[]>([]);

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
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const [ticketPedido, setTicketPedido] = useState<string | null>(null);
  const [showPinManager, setShowPinManager] = useState(false);
  const [cambiosPrecio, setCambiosPrecio] = useState<{ producto: string; tienda: string; antes: number; ahora: number; diff: number }[] | null>(null);
  const prevEstadosPedidos = useRef<Record<string, string>>({});
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

    const normNombre = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    if (ordenFiltro === "mayoreo") {
      ofertas = ofertas.filter((o) => o.precio.precio_mayoreo != null);
      ofertas = [...ofertas].sort((a, b) => {
        const dA = a.precio.precio_mayoreo != null ? a.precio.precio - a.precio.precio_mayoreo : 0;
        const dB = b.precio.precio_mayoreo != null ? b.precio.precio - b.precio.precio_mayoreo : 0;
        return dB - dA;
      });
    } else if (ordenFiltro === "menor") {
      ofertas = [...ofertas].sort((a, b) => a.precio.precio - b.precio.precio);
    } else if (ordenFiltro === "mayor") {
      ofertas = [...ofertas].sort((a, b) => b.precio.precio - a.precio.precio);
    } else {
      // Por defecto: agrupar por nombre normalizado y, dentro, más barato
      // primero. Así "naranja" / "naranjas" / "naranja lima" salen contiguas
      // sin necesidad de fusionar productos en DB.
      ofertas = [...ofertas].sort((a, b) => {
        const nA = normNombre(a.producto.nombre);
        const nB = normNombre(b.producto.nombre);
        if (nA !== nB) return nA.localeCompare(nB);
        return a.precio.precio - b.precio.precio;
      });
    }
    return ofertas;
  }, [todosProductos, categoriaActual, tiendaFiltro, seccionFiltro, subseccionFiltro, ordenFiltro, busqueda, soloAbiertas]);

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
    return secs;
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
    return [...new Set(filtered.map((p) => p.subseccion).filter(Boolean))] as string[];
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
        const estadoLabels: Record<string, string> = {
          en_compra: "Tu pedido esta siendo comprado",
          en_camino: "Tu pedido va en camino",
          entregado: "Tu pedido fue entregado",
          cancelado: "Tu pedido fue cancelado",
        };
        for (const pedido of data) {
          const prev = prevEstadosPedidos.current[pedido.id];
          if (prev && prev !== pedido.estado && estadoLabels[pedido.estado]) {
            playBeep(600, 0.3);
            showNotification(
              "Mercadito - Actualizacion de pedido",
              estadoLabels[pedido.estado],
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
    const ids = Array.from(new Set(carrito.map((c) => c.puesto_id)));
    if (ids.length === 0) {
      setVentanasOpciones([]);
      setAhoraDisponible(true);
      return;
    }
    let cancel = false;
    fetch(`/api/puestos/ventanas-comunes?ids=${ids.join(",")}`)
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
      if (!usuario) {
        await login("cliente", { nombre, telefono });
      }
      fetchMisPedidos();
    } else {
      // Surface el mensaje real del backend en vez de un "intenta de nuevo".
      const data = await res.json().catch(() => ({} as { error?: string }));
      alert(data?.error || "No se pudo enviar el pedido. Revisa tus datos e intenta de nuevo.");
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
                {/* Promo de envío gratis (solo se renderiza si está vigente). */}
                {busqueda.trim().length === 0 && (
                  <BannerPromoEnvioGratis telefono={usuario?.telefono ?? telefono} />
                )}

                {/* Notification permission banner */}
                <div className="mb-3">
                  <NotificationBanner mensaje="Activa las notificaciones para saber cuando tu pedido va en camino" />
                </div>

                {/* Announcements banner */}
                {anuncios.length > 0 && busqueda.trim().length === 0 && (
                  <div className="mb-4 space-y-2">
                    {anuncios.slice(0, 3).map((a) => (
                      <div key={a.id} className="bg-brand-light border border-brand rounded-xl p-3">
                        <p className="font-bold text-navy text-sm">{a.titulo}</p>
                        <p className="text-xs text-brand-dark">{a.mensaje}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barra de búsqueda global */}
                <div className="mb-4">
                  <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar producto, tienda…" />
                </div>

                {busqueda.trim().length === 0 ? (
                  <>
                    <p className="text-gray-500 text-center mb-4">¿Qué necesitas hoy?</p>
                    <div className="grid grid-cols-2 gap-3">
                      {categorias.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setCategoriaActual(cat.id);
                            setTiendaFiltro(null);
                            setSeccionFiltro(null); setSubseccionFiltro(null);
                            fetchTiendasCategoria(cat.id);
                          }}
                          className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform border-2 border-transparent hover:border-brand"
                        >
                          <span className="text-5xl">{cat.icono}</span>
                          <span className="font-bold text-gray-700">{cat.nombre}</span>
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
                    <div className="space-y-3">
                      {ofertasFiltradas.map(({ producto: prod, precio }) => {
                        const tieneExtras = (prod.variantes && prod.variantes.length > 0) || (prod.modificadores && prod.modificadores.length > 0);
                        const enCarrito = !tieneExtras ? getItemSimpleEnCarrito(prod.id, precio.puesto_id) : null;
                        const claveSimple = !tieneExtras ? claveItemCarrito(prod.id, precio.puesto_id, null, []) : null;
                        const cerrada = precio.cerrada === true;
                        return (
                          <div key={`${prod.id}-${precio.puesto_id}`} className={`bg-white rounded-xl p-4 shadow-sm ${cerrada ? "opacity-70" : ""}`}>
                            <div className="flex gap-3">
                              {prod.imagen && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={prod.imagen} alt={prod.nombre} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-800 text-lg">{prod.nombre}</h3>
                                {prod.descripcion && <p className="text-xs text-gray-500 leading-tight">{prod.descripcion}</p>}
                                <p className="text-xs text-gray-400">por {prod.unidad}</p>
                              </div>
                            </div>
                            <div className={`flex items-center justify-between rounded-lg p-3 mt-2 ${cerrada ? "bg-gray-100" : "bg-gray-50"}`}>
                              <div>
                                <span className={`font-bold text-lg ${cerrada ? "text-gray-400 line-through" : "text-navy"}`}>
                                  ${precio.precio}
                                </span>
                                <span className="text-sm text-gray-500 ml-2">{precio.puesto_nombre}</span>
                                {cerrada && (
                                  <span className="ml-2 inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                    🏪💤 Cerrada
                                  </span>
                                )}
                              </div>
                              {enCarrito && claveSimple ? (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => cambiarCantidad(claveSimple, -1)} className="w-9 h-9 bg-red-100 text-red-600 rounded-full font-bold text-xl flex items-center justify-center">−</button>
                                  <span className="font-bold text-lg w-8 text-center">{enCarrito.cantidad}</span>
                                  <button onClick={() => cambiarCantidad(claveSimple, 1)} className="w-9 h-9 bg-green-100 text-green-700 rounded-full font-bold text-xl flex items-center justify-center">+</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
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
                                  className={`px-4 py-2 rounded-full font-medium active:scale-95 transition-transform ${cerrada ? "bg-amber-500 text-white" : "bg-brand text-white"}`}
                                  title={cerrada ? "Esta tienda está cerrada. Tu pedido se programará al confirmar." : undefined}
                                >
                                  {cerrada ? "📅 Programar" : tieneExtras ? "Elegir" : "Agregar"}
                                </button>
                              )}
                            </div>
                          </div>
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
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
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
                      {tiendasCategoria.map((t) => {
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
                          {t.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm">🏪</span>
                          )}
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

                {/* Section filter slider */}
                {seccionesDisponibles.length > 0 && (
                  <div className="mb-3">
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      <button
                        onClick={() => setSeccionFiltro(null)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          !seccionFiltro
                            ? "bg-brand text-white"
                            : "bg-white text-gray-500 border border-gray-200"
                        }`}
                      >
                        Todo
                      </button>
                      {seccionesDisponibles.map((sec) => (
                        <button
                          key={sec}
                          onClick={() => { setSeccionFiltro(seccionFiltro === sec ? null : sec); setSubseccionFiltro(null); }}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            seccionFiltro === sec
                              ? "bg-brand text-white"
                              : "bg-white text-gray-500 border border-gray-200"
                          }`}
                        >
                          {sec}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subsection filter slider */}
                {subseccionesDisponibles.length > 0 && (
                  <div className="mb-3">
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      <button
                        onClick={() => setSubseccionFiltro(null)}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          !subseccionFiltro
                            ? "bg-brand-dark text-white"
                            : "bg-gray-50 text-gray-400 border border-gray-200"
                        }`}
                      >
                        Todo
                      </button>
                      {subseccionesDisponibles.map((sub) => (
                        <button
                          key={sub}
                          onClick={() => setSubseccionFiltro(subseccionFiltro === sub ? null : sub)}
                          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                            subseccionFiltro === sub
                              ? "bg-brand-dark text-white"
                              : "bg-gray-50 text-gray-400 border border-gray-200"
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sort / price filter — persiste al cambiar tienda o categoría */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-medium shrink-0">Ordenar:</span>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
                    <button
                      onClick={() => setOrdenFiltro("default")}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        ordenFiltro === "default"
                          ? "bg-brand text-white"
                          : "bg-white text-gray-500 border border-gray-200"
                      }`}
                    >
                      <span>Por defecto</span>
                    </button>
                    {/* Toggle independiente: ocultar tiendas cerradas */}
                    <button
                      onClick={() => setSoloAbiertas((v) => !v)}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        soloAbiertas
                          ? "bg-green-600 text-white"
                          : "bg-white text-gray-500 border border-gray-200"
                      }`}
                    >
                      <span>🟢</span>
                      <span>Solo abiertas</span>
                    </button>
                    {([
                      { id: "menor", label: "Menor precio", icon: "↑" },
                      { id: "mayor", label: "Mayor precio", icon: "↓" },
                      { id: "mayoreo", label: "Solo mayoreo", icon: "💰" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setOrdenFiltro(opt.id)}
                        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          ordenFiltro === opt.id
                            ? "bg-brand text-white"
                            : "bg-white text-gray-500 border border-gray-200"
                        }`}
                      >
                        {opt.icon && <span>{opt.icon}</span>}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Banner promocional: producto+tienda al azar para
                    fomentar descubrimiento mientras llegan más tiendas.
                    El de "Anúnciate aquí" (BannerAnunciate) lo dejamos
                    importado para reactivar después si hace falta. */}
                {ofertasFiltradas.length > 0 && (
                  <BannerProductoDestacado
                    ofertas={ofertasFiltradas}
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

                {ofertasFiltradas.length === 0 && (() => {
                  // Detección de motivo del vacío para mostrar mensaje correcto.
                  // Prioridad: tienda elegida cerrada → ya cerraron;
                  //   solo mayoreo activo → sin productos en oferta;
                  //   filtros varios → sin match.
                  const tiendaActual = tiendaFiltro ? tiendasCategoria.find((t) => t.id === tiendaFiltro) : null;
                  const tiendaCerrada = tiendaActual?.abierto_ahora === false;
                  const filtrosActivos = !!(tiendaFiltro || seccionFiltro || subseccionFiltro || ordenFiltro !== "default" || soloAbiertas);
                  const busquedaActiva = busqueda.trim().length > 0;

                  if (soloAbiertas && !busquedaActiva && !tiendaFiltro && !seccionFiltro && !subseccionFiltro && ordenFiltro === "default") {
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
                  if (ordenFiltro === "mayoreo") {
                    return (
                      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="text-6xl mb-3">💰</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Sin productos en mayoreo</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          No encontramos productos con descuento por volumen aquí. Prueba otra categoría o quita el filtro.
                        </p>
                        <button
                          onClick={() => setOrdenFiltro("default")}
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
                          onClick={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); setOrdenFiltro("default"); setSoloAbiertas(false); }}
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

                <div className="space-y-3">
                  {ofertasFiltradas.map(({ producto: prod, precio }) => {
                    const tieneExtras = (prod.variantes && prod.variantes.length > 0) || (prod.modificadores && prod.modificadores.length > 0);
                    const enCarrito = !tieneExtras ? getItemSimpleEnCarrito(prod.id, precio.puesto_id) : null;
                    const claveSimple = !tieneExtras ? claveItemCarrito(prod.id, precio.puesto_id, null, []) : null;
                    const cerrada = precio.cerrada === true;
                    return (
                      <div key={`${prod.id}-${precio.puesto_id}`} className={`bg-white rounded-xl p-4 shadow-sm ${cerrada ? "opacity-70" : ""}`}>
                        <div className="flex gap-3">
                          {prod.imagen && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={prod.imagen} alt={prod.nombre} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-800 text-lg">{prod.nombre}</h3>
                            {prod.descripcion && <p className="text-xs text-gray-500 leading-tight">{prod.descripcion}</p>}
                            <p className="text-xs text-gray-400">por {prod.unidad}</p>
                          </div>
                        </div>

                        <div className={`flex items-center justify-between rounded-lg p-3 mt-2 ${cerrada ? "bg-gray-100" : "bg-gray-50"}`}>
                          <div>
                            <span className={`font-bold text-lg ${cerrada ? "text-gray-400 line-through" : "text-navy"}`}>
                              ${precio.precio}
                            </span>
                            <span className="text-sm text-gray-500 ml-2">
                              {precio.puesto_nombre}
                            </span>
                            {cerrada && (
                              <span className="ml-2 inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                🏪💤 Cerrada
                              </span>
                            )}
                            {precio.puesto_ubicacion && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{precio.puesto_ubicacion}</p>
                            )}
                            {precio.precio_mayoreo != null && precio.mayoreo_desde != null && (
                              <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 inline-block">
                                💰 Mayoreo ${precio.precio_mayoreo}/{unidadFormato(prod.unidad, 1)} desde {precio.mayoreo_desde} {unidadFormato(prod.unidad, Number(precio.mayoreo_desde))}
                              </p>
                            )}
                            {tieneExtras && !cerrada && (
                              <p className="text-[11px] text-brand-dark mt-1">Con opciones para elegir</p>
                            )}
                            {cerrada && (
                              <p className="text-[11px] text-red-600 mt-1">Vuelve cuando esté abierta para pedir</p>
                            )}
                          </div>
                          {enCarrito && claveSimple ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => cambiarCantidad(claveSimple, -1)}
                                className="w-9 h-9 bg-red-100 text-red-600 rounded-full font-bold text-xl flex items-center justify-center"
                              >
                                −
                              </button>
                              <span className="font-bold text-lg w-8 text-center">
                                {enCarrito.cantidad}
                              </span>
                              <button
                                onClick={() => cambiarCantidad(claveSimple, 1)}
                                className="w-9 h-9 bg-green-100 text-green-700 rounded-full font-bold text-xl flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
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
                              className={`px-4 py-2 rounded-full font-medium active:scale-95 transition-transform ${cerrada ? "bg-amber-500 text-white" : "bg-brand text-white"}`}
                              title={cerrada ? "Esta tienda está cerrada. Tu pedido se programará al confirmar." : undefined}
                            >
                              {cerrada ? "📅 Programar" : tieneExtras ? "Elegir" : "Agregar"}
                            </button>
                          )}
                        </div>
                      </div>
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
                <div className="space-y-2">
                  {carrito.map((item) => (
                    <div
                      key={`${item.producto_id}-${item.puesto_id}`}
                      className="bg-white rounded-xl p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-800 truncate">{item.producto_nombre}</h4>
                          {(item.variante_nombre || (item.modificadores && item.modificadores.length > 0)) && (
                            <p className="text-[11px] text-brand-dark leading-tight">
                              {[item.variante_nombre, ...(item.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            {item.puesto_nombre} &bull; ${item.precio_unitario}/{item.unidad}
                          </p>
                          {item.precio_mayoreo != null && item.mayoreo_desde != null && (
                            item.cantidad >= item.mayoreo_desde ? (
                              <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block">
                                ✓ Mayoreo aplicado (${item.precio_mayoreo}/{unidadFormato(item.unidad, 1)})
                              </p>
                            ) : (
                              <p className="text-[11px] text-amber-600 mt-0.5">
                                Agrega {item.mayoreo_desde - item.cantidad} {unidadFormato(item.unidad, (item.mayoreo_desde ?? 0) - item.cantidad)} más para precio de mayoreo (${item.precio_mayoreo}/{unidadFormato(item.unidad, 1)})
                              </p>
                            )
                          )}
                          {item.puesto_ubicacion && (
                            <p className="text-xs text-gray-300 leading-tight">{item.puesto_ubicacion}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <button
                            onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), -1)}
                            className="w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold flex items-center justify-center"
                          >
                            −
                          </button>
                          <span className="font-bold w-6 text-center">{item.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), 1)}
                            className="w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold text-navy ml-3 min-w-[60px] text-right">
                          ${item.subtotal.toFixed(0)}
                        </span>
                        <button
                          onClick={() => cambiarCantidad(claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id ?? null, item.modificadores ?? []), -item.cantidad)}
                          aria-label="Quitar del carrito"
                          className="w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center ml-2 hover:bg-red-100 active:scale-90 transition-transform"
                        >
                          <span className="text-lg leading-none">×</span>
                        </button>
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
                  const estados: Record<string, { label: string; color: string; icon: string }> = {
                    pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", icon: "⏳" },
                    en_compra: { label: "Comprando tus productos", color: "bg-blue-100 text-blue-800", icon: "🛒" },
                    en_camino: { label: "En camino", color: "bg-purple-100 text-purple-800", icon: "🛵" },
                    entregado: { label: "Entregado", color: "bg-green-100 text-green-800", icon: "✅" },
                    cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: "❌" },
                  };
                  const info = estados[pedido.estado] || estados.pendiente;
                  const canCancel = pedido.estado === "pendiente";

                  return (
                    <div key={pedido.id} className={`bg-white rounded-xl p-4 shadow-sm ${pedido.estado === "cancelado" ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl">{info.icon}</span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${info.color}`}>
                            {info.label}
                          </span>
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

                      {/* Items — show editor or read-only */}
                      {editandoPedido === pedido.id ? (
                        <EditorPedido
                          pedidoId={pedido.id}
                          items={pedido.items}
                          editadoPor={`cliente ${usuario?.nombre || ""}`}
                          onSaved={() => { setEditandoPedido(null); fetchMisPedidos(); }}
                          onCancel={() => setEditandoPedido(null)}
                        />
                      ) : (
                        <>
                          <div className="bg-gray-50 rounded-lg p-3 mb-3">
                            {pedido.items.map((item) => (
                              <div key={item.id} className="py-0.5">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">
                                    {item.cantidad} {item.unidad} {item.producto_nombre}
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
                      )}

                      {pedido.estado === "en_compra" && (
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-blue-700 font-medium">Ya estan comprando tus productos. Si necesitas cambiar algo, llama al repartidor.</p>
                        </div>
                      )}

                      {pedido.estado === "en_camino" && (
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-purple-700 font-medium">Tu pedido va en camino</p>
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
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: ENTREGA ══════════════ */}
        {tab === "entregar" && (
          <div className="mt-4 space-y-4">
            {/* Promo de envío gratis — visible en checkout para anticipar */}
            <BannerPromoEnvioGratis telefono={telefono || usuario?.telefono} />

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
                      <span className="text-sm font-medium text-gray-700">Efectivo</span>
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
                      <span className="text-sm font-medium text-gray-700">Transferencia</span>
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
                      <span className="text-sm font-medium text-gray-700">Tarjeta</span>
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
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Banco</span>
                            <span className="font-bold text-gray-800">{datos.dimo.banco}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">A nombre de</span>
                            <span className="font-bold text-gray-800 text-right">{datos.dimo.titular}</span>
                          </div>
                        </div>

                        <p className="text-center text-xs text-gray-500">— o también por CLABE —</p>

                        <div className="bg-white rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500">Banco</span>
                            <span className="font-bold text-gray-800">{datos.banco}</span>
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
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500">A nombre de</span>
                            <span className="font-bold text-gray-800 text-right">{datos.beneficiario}</span>
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
    </div>
  );
}
