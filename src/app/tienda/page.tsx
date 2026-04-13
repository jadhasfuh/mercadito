"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/SessionProvider";
import type { ProductoConPrecios, PedidoConItems } from "@/lib/types";

type Tab = "precios" | "pedidos" | "catalogo";

export default function TiendaPage() {
  const { usuario, loading: sessionLoading, login, logout } = useSession();

  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (sessionLoading && !timedOut) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!usuario || usuario.rol !== "tienda") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-3">🏪</span>
            <h1 className="text-2xl font-bold text-gray-800">Mi Tienda</h1>
            <p className="text-sm text-gray-400 mt-1">Acceso para dueños de tienda</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setLoginLoading(true);
              const result = await login("tienda", { telefono, pin });
              if (!result.ok) setError(result.error || "Error al ingresar");
              setLoginLoading(false);
            }}
            className="space-y-4"
          >
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Tu teléfono"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              required
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl text-center tracking-widest focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              required
            />
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-amber-600 text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
            >
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="text-sm text-gray-400 text-center mt-4">
            ¿No tienes cuenta? <a href="/tienda/registro" className="text-amber-600 font-medium">Registra tu tienda</a>
          </p>
        </div>
      </div>
    );
  }

  return <TiendaDashboard usuario={usuario} onLogout={logout} />;
}

const CATEGORIAS_INFO: Record<string, string> = {
  frutas: "🍎", verduras: "🥬", lacteos: "🧀", granos: "🌾",
  comidas: "🍲", carnes: "🥩", abarrotes: "🛒",
};

function TiendaDashboard({
  usuario,
  onLogout,
}: {
  usuario: { nombre: string; puesto_id: string | null };
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("precios");
  const [productos, setProductos] = useState<ProductoConPrecios[]>([]);
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);

  // Add product form
  const [showAddForm, setShowAddForm] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCategoria, setNuevoCategoria] = useState("");
  const [nuevoUnidad, setNuevoUnidad] = useState("kg");
  const [nuevoPrecioProducto, setNuevoPrecioProducto] = useState("");

  useEffect(() => {
    fetchProductos();
  }, []);

  useEffect(() => {
    if (tab === "pedidos") fetchPedidos();
  }, [tab]);

  async function fetchProductos() {
    setLoading(true);
    const res = await fetch("/api/productos");
    const data: ProductoConPrecios[] = await res.json();
    setProductos(data);
    setLoading(false);
  }

  async function fetchPedidos() {
    const res = await fetch("/api/pedidos");
    if (res.ok) {
      const data = await res.json();
      setPedidos(data);
    }
  }

  async function agregarProducto() {
    if (!nuevoNombre || !nuevoCategoria || !nuevoPrecioProducto || !usuario.puesto_id) {
      alert("Llena todos los campos");
      return;
    }
    const res = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nuevoNombre,
        categoria_id: nuevoCategoria,
        unidad: nuevoUnidad,
        precio: parseFloat(nuevoPrecioProducto),
        puesto_id: usuario.puesto_id,
      }),
    });
    if (res.ok) {
      setNuevoNombre("");
      setNuevoCategoria("");
      setNuevoUnidad("kg");
      setNuevoPrecioProducto("");
      setShowAddForm(false);
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "Error al agregar producto");
    }
  }

  async function guardarPrecio(productoId: string) {
    if (!nuevoPrecio || !usuario.puesto_id) return;
    const res = await fetch("/api/precios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        producto_id: productoId,
        puesto_id: usuario.puesto_id,
        precio: parseFloat(nuevoPrecio),
      }),
    });
    if (res.ok) {
      setEditando(null);
      setNuevoPrecio("");
      fetchProductos();
    }
  }

  // Products with price from this store
  const misProductos = productos.filter((p) =>
    p.precios.some((pr) => pr.puesto_id === usuario.puesto_id)
  );
  const sinPrecio = productos.filter(
    (p) => !p.precios.some((pr) => pr.puesto_id === usuario.puesto_id)
  );

  const productosFiltrados = filtroCategoria
    ? misProductos.filter((p) => p.categoria_id === filtroCategoria)
    : misProductos;

  const categorias = [...new Set(misProductos.map((p) => p.categoria_id))];

  // Orders that include items from this store
  const pedidosActivos = pedidos.filter(
    (p) => p.estado !== "entregado" && p.estado !== "cancelado"
  );
  const pedidosRecientes = pedidos.filter(
    (p) => p.estado === "entregado"
  ).slice(0, 10);

  const ESTADOS: Record<string, { label: string; color: string; icon: string }> = {
    pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", icon: "⏳" },
    en_compra: { label: "Comprando", color: "bg-blue-100 text-blue-800", icon: "🛒" },
    en_camino: { label: "En camino", color: "bg-purple-100 text-purple-800", icon: "🛵" },
    entregado: { label: "Entregado", color: "bg-green-100 text-green-800", icon: "✅" },
    cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: "❌" },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-amber-600 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏪</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">{usuario.nombre}</h1>
              <p className="text-xs text-amber-200 leading-tight">Mi Tienda</p>
            </div>
          </div>
          <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-lg mx-auto flex bg-white border-b sticky top-14 z-30">
        {([
          { id: "precios" as Tab, label: "Precios", icon: "💰" },
          { id: "pedidos" as Tab, label: "Pedidos", icon: "📦", badge: pedidosActivos.length || undefined },
          { id: "catalogo" as Tab, label: "Catálogo", icon: "📋" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-sm border-b-2 transition-colors relative ${
              tab === t.id ? "border-amber-600 text-amber-700" : "border-transparent text-gray-400"
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

      <main className="max-w-lg mx-auto px-4 pb-8">
        {/* ══════════════ TAB: PRECIOS ══════════════ */}
        {tab === "precios" && (
          <div className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-gray-400">Cargando productos...</div>
            ) : (
              <>
                {/* Add product button */}
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="w-full mb-3 py-3 border-2 border-dashed border-amber-400 text-amber-700 rounded-xl font-medium active:scale-95 transition-transform"
                >
                  {showAddForm ? "Cancelar" : "+ Agregar producto nuevo"}
                </button>

                {showAddForm && (
                  <div className="bg-amber-50 rounded-xl p-4 mb-4 space-y-3 border border-amber-200">
                    <input
                      type="text"
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      placeholder="Nombre del producto"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-lg bg-white"
                    />
                    <div className="flex gap-2">
                      <select
                        value={nuevoCategoria}
                        onChange={(e) => setNuevoCategoria(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      >
                        <option value="">Categoría...</option>
                        {Object.entries(CATEGORIAS_INFO).map(([id, icono]) => (
                          <option key={id} value={id}>{icono} {id}</option>
                        ))}
                      </select>
                      <select
                        value={nuevoUnidad}
                        onChange={(e) => setNuevoUnidad(e.target.value)}
                        className="w-24 border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      >
                        <option value="kg">kg</option>
                        <option value="litro">litro</option>
                        <option value="pieza">pieza</option>
                        <option value="manojo">manojo</option>
                        <option value="orden">orden</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                        <input
                          type="number"
                          value={nuevoPrecioProducto}
                          onChange={(e) => setNuevoPrecioProducto(e.target.value)}
                          placeholder="Precio"
                          step="0.5"
                          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-lg bg-white"
                        />
                      </div>
                      <button
                        onClick={agregarProducto}
                        className="bg-amber-600 text-white px-6 rounded-lg font-bold active:scale-95 transition-transform"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                )}

                {/* Category filter */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-snap-x mb-4">
                  <button
                    onClick={() => setFiltroCategoria(null)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      !filtroCategoria ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    Todos ({misProductos.length})
                  </button>
                  {categorias.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFiltroCategoria(cat)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroCategoria === cat ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {CATEGORIAS_INFO[cat] || ""} {cat}
                    </button>
                  ))}
                </div>

                {/* Products with prices */}
                <div className="space-y-2">
                  {productosFiltrados.map((prod) => {
                    const miPrecio = prod.precios.find((pr) => pr.puesto_id === usuario.puesto_id);
                    const isEditing = editando === prod.id;

                    return (
                      <div key={prod.id} className="bg-white rounded-xl p-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-700">{prod.nombre}</span>
                            <span className="text-xs text-gray-400 ml-1">/{prod.unidad}</span>
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">$</span>
                              <input
                                type="number"
                                value={nuevoPrecio}
                                onChange={(e) => setNuevoPrecio(e.target.value)}
                                placeholder={String(miPrecio?.precio ?? "")}
                                step="0.5"
                                className="w-20 border border-amber-300 rounded-lg px-2 py-1 text-lg text-right focus:border-amber-500 outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardarPrecio(prod.id);
                                  if (e.key === "Escape") { setEditando(null); setNuevoPrecio(""); }
                                }}
                              />
                              <button
                                onClick={() => guardarPrecio(prod.id)}
                                className="bg-amber-600 text-white w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => { setEditando(null); setNuevoPrecio(""); }}
                                className="text-gray-400 w-8 h-8 flex items-center justify-center"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditando(prod.id); setNuevoPrecio(String(miPrecio?.precio ?? "")); }}
                              className="flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                            >
                              <span className="font-bold text-amber-700 text-lg">
                                ${miPrecio?.precio ?? "—"}
                              </span>
                              <span className="text-amber-400 text-xs">editar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Products without price */}
                {sinPrecio.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-bold text-gray-400 mb-2 text-sm">
                      Sin precio ({sinPrecio.length})
                    </h3>
                    <div className="space-y-2">
                      {sinPrecio.map((prod) => (
                        <div key={prod.id} className="bg-white rounded-xl p-3 shadow-sm opacity-60">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-500">{prod.nombre}</span>
                              <span className="text-xs text-gray-400 ml-1">/{prod.unidad}</span>
                            </div>
                            <button
                              onClick={() => { setEditando(prod.id); setNuevoPrecio(""); }}
                              className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-medium"
                            >
                              + Agregar precio
                            </button>
                          </div>
                          {editando === prod.id && (
                            <div className="flex items-center gap-1 mt-2">
                              <span className="text-gray-400">$</span>
                              <input
                                type="number"
                                value={nuevoPrecio}
                                onChange={(e) => setNuevoPrecio(e.target.value)}
                                placeholder="0.00"
                                step="0.5"
                                className="flex-1 border border-amber-300 rounded-lg px-2 py-1 text-lg focus:border-amber-500 outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardarPrecio(prod.id);
                                  if (e.key === "Escape") { setEditando(null); setNuevoPrecio(""); }
                                }}
                              />
                              <button
                                onClick={() => guardarPrecio(prod.id)}
                                className="bg-amber-600 text-white px-4 py-1 rounded-lg font-bold"
                              >
                                ✓
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: PEDIDOS ══════════════ */}
        {tab === "pedidos" && (
          <div className="mt-4">
            {pedidosActivos.length === 0 && pedidosRecientes.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-400">No hay pedidos todavía</p>
              </div>
            ) : (
              <>
                {/* Active orders */}
                {pedidosActivos.length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-bold text-gray-700 mb-3">
                      Pedidos Activos ({pedidosActivos.length})
                    </h2>
                    <div className="space-y-3">
                      {pedidosActivos.map((pedido) => {
                        const info = ESTADOS[pedido.estado] || ESTADOS.pendiente;
                        return (
                          <div key={pedido.id} className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span>{info.icon}</span>
                                <span className="font-bold">{pedido.cliente_nombre}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${info.color}`}>
                                  {info.label}
                                </span>
                              </div>
                              <span className="font-bold text-amber-700">
                                ${parseFloat(String(pedido.total)).toFixed(2)}
                              </span>
                            </div>

                            <p className="text-xs text-gray-400 mb-2">
                              {new Date(pedido.created_at).toLocaleString("es-MX")}
                            </p>

                            {/* Items from this store */}
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-bold text-gray-500 mb-1">PRODUCTOS:</p>
                              {pedido.items
                                .filter((item) => item.puesto_id === usuario.puesto_id)
                                .map((item) => (
                                  <div key={item.id} className="flex justify-between text-sm py-0.5">
                                    <span className="text-gray-700">
                                      {parseFloat(String(item.cantidad))} {item.unidad} {item.producto_nombre}
                                    </span>
                                    <span className="text-gray-500">
                                      ${parseFloat(String(item.subtotal)).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent delivered */}
                {pedidosRecientes.length > 0 && (
                  <div>
                    <h2 className="font-bold text-gray-400 mb-3 text-sm">Entregados recientes</h2>
                    <div className="space-y-2">
                      {pedidosRecientes.map((pedido) => (
                        <div key={pedido.id} className="bg-white rounded-xl p-3 shadow-sm opacity-60">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-600">{pedido.cliente_nombre}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {new Date(pedido.created_at).toLocaleDateString("es-MX")}
                              </span>
                            </div>
                            <span className="font-medium text-gray-500">
                              ${parseFloat(String(pedido.total)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={fetchPedidos}
                  className="w-full mt-4 py-3 border-2 border-amber-600 text-amber-700 rounded-full font-medium active:scale-95 transition-transform"
                >
                  Actualizar pedidos
                </button>
              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: CATÁLOGO ══════════════ */}
        {tab === "catalogo" && (
          <div className="mt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Tu catálogo:</strong> {misProductos.length} productos con precio.
                Los clientes solo ven productos que tienen precio asignado.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-amber-700">{misProductos.length}</p>
                <p className="text-xs text-gray-400">Con precio</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-gray-400">{sinPrecio.length}</p>
                <p className="text-xs text-gray-400">Sin precio</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-green-600">{productos.length}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
            </div>

            {/* Products by category */}
            {categorias.map((cat) => {
              const prodsEnCat = misProductos.filter((p) => p.categoria_id === cat);
              if (prodsEnCat.length === 0) return null;
              return (
                <div key={cat} className="mb-4">
                  <h3 className="font-bold text-gray-700 mb-2">
                    {CATEGORIAS_INFO[cat] || ""} {cat.charAt(0).toUpperCase() + cat.slice(1)} ({prodsEnCat.length})
                  </h3>
                  <div className="bg-white rounded-xl shadow-sm divide-y">
                    {prodsEnCat.map((prod) => {
                      const miPrecio = prod.precios.find((pr) => pr.puesto_id === usuario.puesto_id);
                      return (
                        <div key={prod.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-gray-700">{prod.nombre}</span>
                            <span className="text-xs text-gray-400 ml-1">/{prod.unidad}</span>
                          </div>
                          <span className="font-bold text-amber-700">${miPrecio?.precio ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
