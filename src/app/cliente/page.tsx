"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import { useSession } from "@/components/SessionProvider";
import type { Categoria, ProductoConPrecios, ItemCarrito, PedidoConItems } from "@/lib/types";
import { getHorarioInfo } from "@/lib/horario";
import { precioCliente, calcularComision } from "@/lib/comision";
import EditorPedido from "@/components/EditorPedido";
import NotificationBanner from "@/components/NotificationBanner";
import { showNotification, playBeep } from "@/lib/notifications";

const MapaEntrega = dynamic(() => import("@/components/MapaEntrega"), { ssr: false });

type Tab = "comprar" | "carrito" | "entregar" | "pedidos";

function ClienteLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { login } = useSession();
  const [loginNombre, setLoginNombre] = useState("");
  const [loginTelefono, setLoginTelefono] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginNombre || !loginTelefono) return;
    setLoginError("");
    setLoginLoading(true);
    const result = await login("cliente", { nombre: loginNombre, telefono: loginTelefono });
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
        <span className="text-5xl block mb-3">📦</span>
        <h2 className="text-xl font-bold text-gray-800">Ver mis pedidos</h2>
        <p className="text-sm text-gray-400 mt-1">Ingresa tus datos para ver tus pedidos</p>
      </div>
      <form onSubmit={handleLogin} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Tu nombre</label>
          <input
            type="text"
            value={loginNombre}
            onChange={(e) => setLoginNombre(e.target.value)}
            placeholder="Como te llamas"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Tu telefono</label>
          <input
            type="tel"
            value={loginTelefono}
            onChange={(e) => setLoginTelefono(e.target.value)}
            placeholder="El mismo con el que hiciste tu pedido"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
            required
          />
        </div>
        {loginError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
            {loginError}
          </div>
        )}
        <button
          type="submit"
          disabled={loginLoading}
          className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
        >
          {loginLoading ? "Entrando..." : "Ver mis pedidos"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Usa el mismo telefono con el que hiciste tu pedido
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
  otro: { nombre: "Otro", icono: "📦" },
};

export default function ClientePage() {
  const { usuario, login, logout } = useSession();
  const [tab, setTab] = useState<Tab>("comprar");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [tiendaFiltro, setTiendaFiltro] = useState<string | null>(null); // filter products by store
  const [tiendasCategoria, setTiendasCategoria] = useState<{ id: string; nombre: string; ubicacion: string | null; lat: number | null; lng: number | null; categorias: string[] }[]>([]);
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
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta">("efectivo");
  const [pedidoConfirmado, setPedidoConfirmado] = useState<string | null>(null);
  const [misPedidos, setMisPedidos] = useState<PedidoConItems[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const [cambiosPrecio, setCambiosPrecio] = useState<{ producto: string; tienda: string; antes: number; ahora: number; diff: number }[] | null>(null);
  const prevEstadosPedidos = useRef<Record<string, string>>({});
  const [nuevoSubtotal, setNuevoSubtotal] = useState(0);

  useEffect(() => {
    fetchProductos();
    fetch("/api/anuncios?tipo=clientes").then((r) => r.json()).then(setAnuncios).catch(() => {});
  }, []);

  // Pre-fill from session
  useEffect(() => {
    if (usuario && usuario.rol === "cliente") {
      if (!nombre) setNombre(usuario.nombre);
      if (!telefono) setTelefono(usuario.telefono);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  async function fetchProductos() {
    setLoading(true);
    const res = await fetch("/api/productos");
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

  const productosFiltrados = useMemo(() => {
    if (!categoriaActual) return [];
    let filtered = todosProductos.filter((p) => p.categoria_id === categoriaActual);
    if (tiendaFiltro) {
      filtered = filtered.map((p) => ({
        ...p,
        precios: p.precios.filter((pr) => pr.puesto_id === tiendaFiltro),
      })).filter((p) => p.precios.length > 0);
    }
    return filtered;
  }, [todosProductos, categoriaActual, tiendaFiltro]);

  const agregarAlCarrito = useCallback(
    (producto: ProductoConPrecios, precioInfo: { puesto_id: string; puesto_nombre: string; precio: number; comision: number; puesto_ubicacion?: string }) => {
      setCarrito((prev) => {
        const existing = prev.find(
          (item) => item.producto_id === producto.id && item.puesto_id === precioInfo.puesto_id
        );
        if (existing) {
          return prev.map((item) =>
            item.producto_id === producto.id && item.puesto_id === precioInfo.puesto_id
              ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unitario }
              : item
          );
        }
        return [
          ...prev,
          {
            producto_id: producto.id,
            producto_nombre: producto.nombre,
            puesto_id: precioInfo.puesto_id,
            puesto_nombre: precioInfo.puesto_nombre,
            puesto_ubicacion: precioInfo.puesto_ubicacion,
            cantidad: 1,
            precio_unitario: precioInfo.precio,
            comision: precioInfo.comision,
            unidad: producto.unidad,
            subtotal: precioInfo.precio,
          },
        ];
      });
    },
    []
  );

  function cambiarCantidad(productoId: string, puestoId: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((item) => {
          if (item.producto_id === productoId && item.puesto_id === puestoId) {
            const nueva = item.cantidad + delta;
            if (nueva <= 0) return null;
            return { ...item, cantidad: nueva, subtotal: nueva * item.precio_unitario };
          }
          return item;
        })
        .filter(Boolean) as ItemCarrito[]
    );
  }

  function getItemEnCarrito(productoId: string, puestoId: string) {
    return carrito.find((item) => item.producto_id === productoId && item.puesto_id === puestoId);
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

  const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  // Card surcharge: 3.50% + IVA (16%) = 4.06%
  const RECARGO_TARJETA = 0.0406;
  const subtotalConEnvio = subtotal + costoEnvio;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(subtotalConEnvio * RECARGO_TARJETA) : 0;
  const total = subtotalConEnvio + recargoTarjeta;

  // Determine all delivery origins (all stores with items in cart), sorted by subtotal desc
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
      const res = await fetch("/api/productos");
      const productosActuales: ProductoConPrecios[] = await res.json();

      const cambios: { producto: string; tienda: string; antes: number; ahora: number; diff: number }[] = [];
      const carritoActualizado = carrito.map((item) => {
        const prod = productosActuales.find((p) => p.id === item.producto_id);
        const precioActual = prod?.precios.find((pr) => pr.puesto_id === item.puesto_id);
        if (precioActual) {
          const precioConComision = precioCliente(precioActual.precio);
          if (precioConComision !== item.precio_unitario) {
            cambios.push({
              producto: item.producto_nombre,
              tienda: item.puesto_nombre,
              antes: item.precio_unitario,
              ahora: precioConComision,
              diff: precioConComision - item.precio_unitario,
            });
            return { ...item, precio_unitario: precioConComision, comision: calcularComision(precioActual.precio), subtotal: item.cantidad * precioConComision };
          }
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

  async function enviarPedido() {
    setEnviando(true);
    setCambiosPrecio(null);

    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        zona_id: "custom",
        direccion_entrega: `${direccion}${numeroCasa ? ` #${numeroCasa}` : ""} [${ubicacion!.lat.toFixed(6)}, ${ubicacion!.lng.toFixed(6)}]`,
        notas: notas ? `${notas}${metodoPago === "tarjeta" ? " [PAGO CON TARJETA]" : ""}` : (metodoPago === "tarjeta" ? "[PAGO CON TARJETA]" : undefined),
        costo_envio_override: costoEnvio,
        metodo_pago: metodoPago,
        recargo_tarjeta: recargoTarjeta,
        items: carrito.map((item) => ({
          producto_id: item.producto_id,
          puesto_id: item.puesto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          comision: item.comision,
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setPedidoConfirmado(data.id);
      setCarrito([]);
      if (!usuario) {
        await login("cliente", { nombre, telefono });
      }
      fetchMisPedidos();
    } else {
      alert("Error al enviar pedido. Intenta de nuevo.");
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
    setTab("comprar");
    setCategoriaActual(null);
  }

  // ── PEDIDO CONFIRMADO ──
  if (pedidoConfirmado) {
    return (
      <div className="min-h-screen bg-cream">
        <Header title="Mercadito" />
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
              onClick={() => setTab(t.id)}
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
              /* ── Categorías ── */
              <div>
                {/* Notification permission banner */}
                <div className="mb-3">
                  <NotificationBanner mensaje="Activa las notificaciones para saber cuando tu pedido va en camino" />
                </div>

                {/* Announcements banner */}
                {anuncios.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {anuncios.slice(0, 3).map((a) => (
                      <div key={a.id} className="bg-brand-light border border-brand rounded-xl p-3">
                        <p className="font-bold text-navy text-sm">{a.titulo}</p>
                        <p className="text-xs text-brand-dark">{a.mensaje}</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-gray-500 text-center mb-4">¿Qué necesitas hoy?</p>
                <div className="grid grid-cols-2 gap-3">
                  {categorias.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setCategoriaActual(cat.id);
                        setTiendaFiltro(null);
                        fetchTiendasCategoria(cat.id);
                      }}
                      className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform border-2 border-transparent hover:border-brand"
                    >
                      <span className="text-5xl">{cat.icono}</span>
                      <span className="font-bold text-gray-700">{cat.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Productos de la categoría ── */
              <div>
                {/* Swipeable category bar — full width with scroll */}
                <div className="-mx-4 px-4 mb-1">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-snap-x py-2">
                    <button
                      onClick={() => { setCategoriaActual(null); setTiendaFiltro(null); }}
                      className="flex-shrink-0 flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium bg-gray-200 text-gray-700 active:scale-95 transition-transform"
                    >
                      ← Todas
                    </button>
                    {categorias.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setCategoriaActual(cat.id);
                          setTiendaFiltro(null);
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

                {/* Store filter bar */}
                {tiendasCategoria.length > 1 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-1.5">Filtrar por tienda:</p>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      <button
                        onClick={() => setTiendaFiltro(null)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          !tiendaFiltro
                            ? "bg-brand-light text-brand-dark border border-brand"
                            : "bg-white text-gray-500 border border-gray-200"
                        }`}
                      >
                        Todas las tiendas
                      </button>
                      {tiendasCategoria.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTiendaFiltro(t.id)}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            tiendaFiltro === t.id
                              ? "bg-brand-light text-brand-dark border border-brand"
                              : "bg-white text-gray-500 border border-gray-200"
                          }`}
                        >
                          {t.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Estimated delivery cost info */}
                <div className="bg-brand-light border border-brand rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <span className="text-sm">🛵</span>
                  <p className="text-xs text-navy">
                    Envio: <strong>$20-$30</strong> en Sahuayo, mas lejos sube
                    {tiendaFiltro && " (comprar de una sola tienda puede reducir el costo)"}
                  </p>
                </div>

                <div className="space-y-3">
                  {productosFiltrados.map((prod) => (
                    <div key={prod.id} className="bg-white rounded-xl p-4 shadow-sm">
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

                      {prod.precios.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Sin precio disponible hoy</p>
                      ) : (
                        <div className="space-y-2">
                          {prod.precios.map((precio) => {
                            const enCarrito = getItemEnCarrito(prod.id, precio.puesto_id);
                            return (
                              <div
                                key={precio.puesto_id}
                                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                              >
                                <div>
                                  <span className="font-bold text-navy text-lg">
                                    ${precioCliente(precio.precio)}
                                  </span>
                                  <span className="text-sm text-gray-500 ml-2">
                                    {precio.puesto_nombre}
                                  </span>
                                  {precio.puesto_ubicacion && (
                                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{precio.puesto_ubicacion}</p>
                                  )}
                                </div>
                                {enCarrito ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => cambiarCantidad(prod.id, precio.puesto_id, -1)}
                                      className="w-9 h-9 bg-red-100 text-red-600 rounded-full font-bold text-xl flex items-center justify-center"
                                    >
                                      −
                                    </button>
                                    <span className="font-bold text-lg w-8 text-center">
                                      {enCarrito.cantidad}
                                    </span>
                                    <button
                                      onClick={() => cambiarCantidad(prod.id, precio.puesto_id, 1)}
                                      className="w-9 h-9 bg-green-100 text-green-700 rounded-full font-bold text-xl flex items-center justify-center"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() =>
                                      agregarAlCarrito(prod, {
                                        puesto_id: precio.puesto_id,
                                        puesto_nombre: precio.puesto_nombre,
                                        precio: precioCliente(precio.precio),
                                        comision: calcularComision(precio.precio),
                                        puesto_ubicacion: precio.puesto_ubicacion,
                                      })
                                    }
                                    className="bg-brand text-white px-4 py-2 rounded-full font-medium active:scale-95 transition-transform"
                                  >
                                    Agregar
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
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
                          <p className="text-xs text-gray-400">
                            {item.puesto_nombre} &bull; ${item.precio_unitario}/{item.unidad}
                          </p>
                          {item.puesto_ubicacion && (
                            <p className="text-xs text-gray-300 leading-tight">{item.puesto_ubicacion}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <button
                            onClick={() => cambiarCantidad(item.producto_id, item.puesto_id, -1)}
                            className="w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold flex items-center justify-center"
                          >
                            −
                          </button>
                          <span className="font-bold w-6 text-center">{item.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(item.producto_id, item.puesto_id, 1)}
                            className="w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold text-navy ml-3 min-w-[60px] text-right">
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
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  {costoEnvio > 0 && (
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Envío ({zonaEnvio})</span>
                      <span className="font-medium">${costoEnvio.toFixed(2)}</span>
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
                  <button
                    onClick={logout}
                    className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full"
                  >
                    Cambiar
                  </button>
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
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{info.icon}</span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${info.color}`}>
                            {info.label}
                          </span>
                        </div>
                        <span className="font-bold text-navy">${pedido.total.toFixed(2)}</span>
                      </div>

                      <p className="text-xs text-gray-400 mb-2">
                        {new Date(pedido.created_at).toLocaleString("es-MX")} &bull; #{pedido.id.slice(0, 8).toUpperCase()}
                      </p>

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
                              <div key={item.id} className="flex justify-between text-sm py-0.5">
                                <span className="text-gray-600">
                                  {item.cantidad} {item.unidad} {item.producto_nombre}
                                </span>
                                <span className="text-gray-500">${item.subtotal.toFixed(2)}</span>
                              </div>
                            ))}
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
                onUbicacionSeleccionada={(data) => {
                  setUbicacion({ lat: data.lat, lng: data.lng });
                  setCostoEnvio(data.costoEnvio);
                  setZonaEnvio(data.zona);
                  setTiempoEnvio(data.tiempoTotal);
                }}
                onDireccionDetectada={(dir) => setDireccion(dir)}
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
                <label className="block text-sm font-medium text-gray-600 mb-1">WhatsApp</label>
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
                  <div className="grid grid-cols-2 gap-2">
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
                </div>

                <div className="border-t mt-2 pt-2 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Productos</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
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
                    disabled={!horario.abierto || enviando || carrito.length === 0 || !ubicacion || costoEnvio === 0 || !nombre || !telefono || !direccion || !numeroCasa}
                    className="w-full bg-brand text-white py-4 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform shadow-lg"
                  >
                    {!horario.abierto
                      ? "Cerrado — vuelve de 8 AM a 11 PM"
                      : enviando
                      ? "Verificando precios..."
                      : carrito.length === 0
                      ? "Agrega productos primero"
                      : !nombre || !telefono
                      ? "Llena tu nombre y WhatsApp"
                      : !ubicacion || !direccion
                      ? "Marca tu ubicacion en el mapa"
                      : !numeroCasa
                      ? "Escribe tu no. de casa"
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
    </div>
  );
}
