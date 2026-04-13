"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import { useSession } from "@/components/SessionProvider";
import type { Categoria, ProductoConPrecios, ItemCarrito, PedidoConItems } from "@/lib/types";

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
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
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
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
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
          className="w-full bg-emerald-600 text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
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
  lacteos: { nombre: "Lácteos", icono: "🧀" },
  granos: { nombre: "Granos", icono: "🌾" },
  comidas: { nombre: "Comidas", icono: "🍲" },
  carnes: { nombre: "Carnes", icono: "🥩" },
  abarrotes: { nombre: "Abarrotes", icono: "🛒" },
};

export default function ClientePage() {
  const { usuario, login, logout } = useSession();
  const [tab, setTab] = useState<Tab>("comprar");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [todosProductos, setTodosProductos] = useState<ProductoConPrecios[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [loading, setLoading] = useState(true);

  // Checkout — pre-fill from session if available
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [zonaEnvio, setZonaEnvio] = useState("");
  const [tiempoEnvio, setTiempoEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<string | null>(null);
  const [misPedidos, setMisPedidos] = useState<PedidoConItems[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);

  useEffect(() => {
    fetchProductos();
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

  const productosFiltrados = useMemo(() => {
    if (!categoriaActual) return [];
    return todosProductos.filter((p) => p.categoria_id === categoriaActual);
  }, [todosProductos, categoriaActual]);

  const agregarAlCarrito = useCallback(
    (producto: ProductoConPrecios, precioInfo: { puesto_id: string; puesto_nombre: string; precio: number }) => {
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
            cantidad: 1,
            precio_unitario: precioInfo.precio,
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
        const data = await res.json();
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

  // Load orders when switching to pedidos tab
  useEffect(() => {
    if (tab === "pedidos" && usuario) {
      fetchMisPedidos();
    }
  }, [tab, usuario]);

  const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const total = subtotal + costoEnvio;

  async function enviarPedido() {
    if (!nombre || !telefono || !direccion) {
      alert("Por favor llena tu nombre, teléfono y dirección");
      return;
    }
    if (!ubicacion) {
      alert("Marca tu punto de entrega en el mapa");
      return;
    }
    if (subtotal < 150) {
      alert("El mínimo de compra es $150 MXN");
      return;
    }
    if (costoEnvio === 0) {
      alert("Tu ubicación está fuera de la zona de cobertura");
      return;
    }

    setEnviando(true);
    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        zona_id: "custom",
        direccion_entrega: `${direccion} [${ubicacion.lat.toFixed(6)}, ${ubicacion.lng.toFixed(6)}]`,
        notas: notas || undefined,
        costo_envio_override: costoEnvio,
        items: carrito.map((item) => ({
          producto_id: item.producto_id,
          puesto_id: item.puesto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setPedidoConfirmado(data.id);
      setCarrito([]);
      // Save client session so data is pre-filled next time
      if (!usuario) {
        await login("cliente", { nombre, telefono });
      }
      // Refresh orders list
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
      <div className="min-h-screen bg-gray-50">
        <Header title="Mercadito" />
        <main className="max-w-lg mx-auto px-4 py-8 text-center">
          <span className="text-7xl block mb-4">✅</span>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Pedido recibido!</h2>
          <p className="text-gray-500 mb-6">
            Te contactaremos por WhatsApp para confirmar.
          </p>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <p className="text-sm text-gray-400">Número de pedido</p>
            <p className="font-mono font-bold text-2xl text-emerald-700">
              {pedidoConfirmado.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            onClick={resetearPedido}
            className="bg-emerald-600 text-white px-8 py-3 rounded-full font-bold text-lg active:scale-95 transition-transform"
          >
            Hacer otro pedido
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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
                  ? "border-emerald-600 text-emerald-700"
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
                <p className="text-gray-500 text-center mb-4">¿Qué necesitas hoy?</p>
                <div className="grid grid-cols-2 gap-3">
                  {categorias.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoriaActual(cat.id)}
                      className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform border-2 border-transparent hover:border-emerald-300"
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
                      onClick={() => setCategoriaActual(null)}
                      className="flex-shrink-0 flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium bg-gray-200 text-gray-700 active:scale-95 transition-transform"
                    >
                      ← Todas
                    </button>
                    {categorias.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoriaActual(cat.id)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                          cat.id === categoriaActual
                            ? "bg-emerald-600 text-white shadow-md"
                            : "bg-white text-gray-600 shadow-sm border border-gray-100"
                        }`}
                      >
                        <span className="text-base">{cat.icono}</span>
                        {cat.nombre}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {productosFiltrados.map((prod) => (
                    <div key={prod.id} className="bg-white rounded-xl p-4 shadow-sm">
                      <h3 className="font-bold text-gray-800 text-lg">{prod.nombre}</h3>
                      <p className="text-xs text-gray-400 mb-2">por {prod.unidad}</p>

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
                                  <span className="font-bold text-emerald-700 text-lg">
                                    ${precio.precio}
                                  </span>
                                  <span className="text-sm text-gray-500 ml-2">
                                    {precio.puesto_nombre}
                                  </span>
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
                                      className="w-9 h-9 bg-green-100 text-emerald-700 rounded-full font-bold text-xl flex items-center justify-center"
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
                                        precio: precio.precio,
                                      })
                                    }
                                    className="bg-emerald-600 text-white px-4 py-2 rounded-full font-medium active:scale-95 transition-transform"
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
                            className="w-8 h-8 bg-green-100 text-emerald-700 rounded-full font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold text-emerald-700 ml-3 min-w-[60px] text-right">
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
                    <span className="text-emerald-700">${total.toFixed(2)}</span>
                  </div>
                </div>

                {subtotal < 150 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mt-3 text-center">
                    <p className="text-sm text-yellow-700">
                      Mínimo de compra: $150 — te faltan{" "}
                      <strong>${(150 - subtotal).toFixed(0)}</strong>
                    </p>
                  </div>
                )}
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
                  className="text-emerald-600 font-bold mt-2"
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
                        <span className="font-bold text-emerald-700">${pedido.total.toFixed(2)}</span>
                      </div>

                      <p className="text-xs text-gray-400 mb-2">
                        {new Date(pedido.created_at).toLocaleString("es-MX")} &bull; #{pedido.id.slice(0, 8).toUpperCase()}
                      </p>

                      {/* Items */}
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
                          <span className="text-gray-500">Envío</span>
                          <span className="text-gray-500">${pedido.costo_envio.toFixed(2)}</span>
                        </div>
                      </div>

                      {canCancel && (
                        <button
                          onClick={() => cancelarPedido(pedido.id)}
                          className="w-full py-2 border-2 border-red-300 text-red-600 rounded-lg font-medium text-sm active:scale-95 transition-transform"
                        >
                          Cancelar pedido
                        </button>
                      )}

                      {pedido.estado === "en_compra" && (
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-blue-700 font-medium">Ya estan comprando tus productos. Si necesitas cancelar, llama al repartidor.</p>
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
                  className="w-full py-3 border-2 border-emerald-600 text-emerald-700 rounded-full font-medium active:scale-95 transition-transform"
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
              <MapaEntrega
                ubicacionInicial={ubicacion}
                onUbicacionSeleccionada={(data) => {
                  setUbicacion({ lat: data.lat, lng: data.lng });
                  setCostoEnvio(data.costoEnvio);
                  setZonaEnvio(data.zona);
                  setTiempoEnvio(data.tiempo);
                }}
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
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="353 123 4567"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Dirección</label>
                <textarea
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Calle, número, colonia, referencia..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
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
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
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
                <div className="border-t mt-2 pt-2 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Productos</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Envío</span>
                    <span>{costoEnvio > 0 ? `$${costoEnvio.toFixed(2)}` : "Selecciona ubicación"}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold pt-1 border-t">
                    <span>Total</span>
                    <span className="text-emerald-700">${total.toFixed(2)}</span>
                  </div>
                  {tiempoEnvio && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      Tiempo estimado de entrega: {tiempoEnvio} &bull; Pago en efectivo
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={enviarPedido}
              disabled={enviando || carrito.length === 0 || subtotal < 150 || !ubicacion || costoEnvio === 0}
              className="w-full bg-emerald-600 text-white py-4 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform shadow-lg"
            >
              {enviando
                ? "Enviando pedido..."
                : carrito.length === 0
                ? "Agrega productos primero"
                : subtotal < 150
                ? `Faltan $${(150 - subtotal).toFixed(0)} para el mínimo`
                : `Confirmar Pedido — $${total.toFixed(2)}`}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
