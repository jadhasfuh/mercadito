"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/components/SessionProvider";
import type { ProductoConPrecios, PedidoConItems } from "@/lib/types";
import { calcularComision } from "@/lib/comision";
import { getUnidadesParaCategoria } from "@/lib/categorias";
import NotificationBanner from "@/components/NotificationBanner";
import { showNotification, playBeep } from "@/lib/notifications";

const MapaUbicacionTienda = dynamic(() => import("@/components/MapaUbicacionTienda"), { ssr: false });

type Tab = "precios" | "pedidos" | "catalogo" | "mitienda";

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
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  // Allow tienda users and repartidores with a puesto_id
  const canAccessTienda = usuario && (usuario.rol === "tienda" || usuario.rol === "admin" || (usuario.rol === "repartidor" && usuario.puesto_id));
  if (!canAccessTienda) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl text-center tracking-widest focus:border-brand focus:ring-1 focus:ring-brand outline-none"
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
              className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
            >
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="text-sm text-gray-400 text-center mt-4">
            ¿No tienes cuenta? <a href="/tienda/registro" className="text-brand-dark font-medium">Registra tu tienda</a>
          </p>
        </div>
      </div>
    );
  }

  return <TiendaDashboard usuario={usuario} onLogout={logout} />;
}

const CATEGORIAS_INFO: Record<string, { icono: string; nombre: string }> = {
  frutas: { icono: "🍎", nombre: "Frutas" },
  verduras: { icono: "🥬", nombre: "Verduras" },
  carnes: { icono: "🥩", nombre: "Carnes" },
  lacteos: { icono: "🧀", nombre: "Lácteos" },
  cremeria: { icono: "🧈", nombre: "Cremería" },
  abarrotes: { icono: "🛒", nombre: "Abarrotes" },
  granos: { icono: "🌾", nombre: "Granos" },
  restaurante: { icono: "🍽️", nombre: "Restaurante" },
  botanero: { icono: "🍻", nombre: "Centro Botanero" },
  cafeteria: { icono: "☕", nombre: "Cafetería" },
  comidas: { icono: "🍲", nombre: "Comidas" },
  antojitos: { icono: "🌮", nombre: "Antojitos" },
  panaderia: { icono: "🍞", nombre: "Panadería" },
  bebidas: { icono: "🥤", nombre: "Bebidas" },
  farmacia: { icono: "💊", nombre: "Farmacia" },
  limpieza: { icono: "🧹", nombre: "Limpieza" },
  mascotas: { icono: "🐾", nombre: "Mascotas" },
  otro: { icono: "📦", nombre: "Otro" },
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

  // Store info
  const [tiendaNombre, setTiendaNombre] = useState("");
  const [tiendaDireccion, setTiendaDireccion] = useState("");
  const [tiendaNumeroLocal, setTiendaNumeroLocal] = useState("");
  const [tiendaTelefono, setTiendaTelefono] = useState("");
  const [tiendaReferencias, setTiendaReferencias] = useState("");
  const [tiendaUbicacion, setTiendaUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [guardandoTienda, setGuardandoTienda] = useState(false);
  const [tiendaCargada, setTiendaCargada] = useState(false);
  const [tiendaDesactivada, setTiendaDesactivada] = useState(false);
  const [tiendaCategorias, setTiendaCategorias] = useState<string[]>([]);
  const [anunciosTienda, setAnunciosTienda] = useState<{ id: string; titulo: string; mensaje: string; created_at: string }[]>([]);
  const [mensajes, setMensajes] = useState<{ id: string; mensaje: string; de_nombre: string; leido: boolean; created_at: string }[]>([]);
  const [mostrarMensajes, setMostrarMensajes] = useState(false);

  // Check if store is active on mount
  useEffect(() => {
    if (usuario.puesto_id) {
      fetch("/api/puestos").then((r) => r.json()).then((puestos) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mi = puestos.find((p: any) => p.id === usuario.puesto_id);
        if (!mi) setTiendaDesactivada(true);
      });
    }
  }, [usuario.puesto_id]);

  // Add product form
  const [showAddForm, setShowAddForm] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCategoria, setNuevoCategoria] = useState("");
  const [nuevoUnidad, setNuevoUnidad] = useState("");
  const [nuevoDescripcion, setNuevoDescripcion] = useState("");
  const [nuevoImagen, setNuevoImagen] = useState("");
  const [nuevoPrecioProducto, setNuevoPrecioProducto] = useState("");

  const prevPedidosRef = useRef(0);

  // (notification permission handled by NotificationBanner component)

  useEffect(() => {
    fetchProductos();
    fetch("/api/anuncios?tipo=tiendas").then((r) => r.json()).then(setAnunciosTienda).catch(() => {});
    fetch("/api/mensajes").then((r) => r.json()).then(setMensajes).catch(() => {});
  }, []);

  // Load store info when switching to mitienda tab
  useEffect(() => {
    if (tab === "mitienda" && !tiendaCargada && usuario.puesto_id) {
      fetch("/api/puestos")
        .then((r) => r.json())
        .then((puestos) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mi = puestos.find((p: any) => p.id === usuario.puesto_id);
          if (mi) {
            setTiendaNombre(mi.nombre || "");
            // Parse "Calle, Colonia #42" → direccion + numero
            const ubic = mi.ubicacion || "";
            const hashMatch = ubic.match(/^(.+?)\s*#(.+)$/);
            if (hashMatch) {
              setTiendaDireccion(hashMatch[1].trim());
              setTiendaNumeroLocal(hashMatch[2].trim());
            } else {
              setTiendaDireccion(ubic);
            }
            setTiendaTelefono(mi.telefono_contacto || "");
            setTiendaReferencias(mi.descripcion || "");
            if (mi.lat && mi.lng) setTiendaUbicacion({ lat: mi.lat, lng: mi.lng });
            setTiendaCategorias(mi.categorias || []);
            setTiendaCargada(true);
          }
        });
    }
  }, [tab, tiendaCargada, usuario.puesto_id]);

  async function guardarDatosTienda() {
    if (!tiendaNombre) { alert("El nombre de la tienda es obligatorio"); return; }
    if (!tiendaDireccion) { alert("Toca el mapa para marcar la ubicacion de tu tienda"); return; }
    if (!tiendaNumeroLocal) { alert("Escribe el numero de local o puesto"); return; }

    setGuardandoTienda(true);
    const direccionCompleta = `${tiendaDireccion} #${tiendaNumeroLocal}`;
    const res = await fetch("/api/puestos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: tiendaNombre,
        ubicacion: direccionCompleta,
        descripcion: tiendaReferencias || null,
        telefono_contacto: tiendaTelefono.replace(/\D/g, "") || null,
        lat: tiendaUbicacion?.lat ?? null,
        lng: tiendaUbicacion?.lng ?? null,
        categorias: tiendaCategorias,
      }),
    });
    if (res.ok) {
      alert("Datos actualizados");
    } else {
      const data = await res.json();
      alert(data.error || "Error al guardar");
    }
    setGuardandoTienda(false);
  }

  useEffect(() => {
    if (tab === "pedidos") {
      fetchPedidos();
      const interval = setInterval(fetchPedidos, 15000);
      return () => clearInterval(interval);
    }
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
      // Notify on new orders
      const activos = data.filter((p: PedidoConItems) => p.estado !== "entregado" && p.estado !== "cancelado").length;
      if (prevPedidosRef.current > 0 && activos > prevPedidosRef.current) {
        playBeep(600, 0.4);
        showNotification(
          "Mercadito - Nuevo pedido para tu tienda",
          "Tienes un nuevo pedido con tus productos",
          "/tienda"
        );
      }
      prevPedidosRef.current = activos;
      setPedidos(data);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) {
      alert("La imagen es muy grande. Maximo 5MB.");
      return;
    }
    // Compress image with canvas
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 800; // max dimension
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      setNuevoImagen(compressed);
    };
    img.src = URL.createObjectURL(file);
  }

  async function agregarProducto() {
    const faltantes = [];
    if (!nuevoNombre) faltantes.push("nombre");
    if (!nuevoCategoria) faltantes.push("categoria");
    if (!nuevoUnidad) faltantes.push("unidad");
    if (!nuevoPrecioProducto) faltantes.push("precio");
    if (!usuario.puesto_id) faltantes.push("puesto (error de sesion, cierra e inicia sesion de nuevo)");
    if (faltantes.length > 0) {
      alert("Falta: " + faltantes.join(", "));
      return;
    }
    const res = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nuevoNombre,
        categoria_id: nuevoCategoria,
        unidad: nuevoUnidad,
        descripcion: nuevoDescripcion || undefined,
        imagen: nuevoImagen || undefined,
        precio: parseFloat(nuevoPrecioProducto),
        puesto_id: usuario.puesto_id,
      }),
    });
    if (res.ok) {
      setNuevoNombre("");
      setNuevoCategoria("");
      setNuevoUnidad("");
      setNuevoDescripcion("");
      setNuevoImagen("");
      setNuevoPrecioProducto("");
      setShowAddForm(false);
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "Error al agregar producto");
    }
  }

  async function eliminarProducto(productoId: string, nombre: string) {
    if (!confirm(`¿Seguro que quieres eliminar "${nombre}"? Se borrara el producto y su precio.`)) return;
    const res = await fetch(`/api/productos/${productoId}`, { method: "DELETE" });
    if (res.ok) {
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo eliminar");
    }
  }

  async function editarProducto(productoId: string, campo: string, valorActual: string) {
    const nuevo = prompt(`Nuevo ${campo}:`, valorActual);
    if (!nuevo || nuevo === valorActual) return;
    const res = await fetch(`/api/productos/${productoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: nuevo }),
    });
    if (res.ok) {
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo editar");
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

  if (tiendaDesactivada) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm text-center">
          <span className="text-5xl block mb-4">🚫</span>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Tienda desactivada</h2>
          <p className="text-sm text-gray-500 mb-4">
            Tu tienda fue desactivada por el administrador. Contacta a soporte si crees que es un error.
          </p>
          <button onClick={onLogout} className="bg-gray-200 text-gray-600 px-6 py-2 rounded-full font-medium">
            Salir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏪</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">{usuario.nombre}</h1>
              <p className="text-xs text-blue-200 leading-tight">Mi Tienda</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMostrarMensajes(!mostrarMensajes); if (!mostrarMensajes) { fetch("/api/mensajes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "all" }) }).then(() => setMensajes((prev) => prev.map((m) => ({ ...m, leido: true })))); } }}
              className="relative text-sm bg-white/20 px-2 py-1 rounded-full"
            >
              <span className="text-lg">🔔</span>
              {mensajes.filter((m) => !m.leido).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {mensajes.filter((m) => !m.leido).length}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-lg mx-auto flex bg-white border-b sticky top-14 z-30">
        {([
          { id: "precios" as Tab, label: "Precios", icon: "💰" },
          { id: "pedidos" as Tab, label: "Pedidos", icon: "📦", badge: pedidosActivos.length || undefined },
          { id: "catalogo" as Tab, label: "Catálogo", icon: "📋" },
          { id: "mitienda" as Tab, label: "Mi tienda", icon: "🏪" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-sm border-b-2 transition-colors relative ${
              tab === t.id ? "border-brand text-brand-dark" : "border-transparent text-gray-400"
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
        {/* Messages panel */}
        {mostrarMensajes && (
          <div className="mt-3 bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Mensajes de Mercadito</h3>
              <button onClick={() => setMostrarMensajes(false)} className="text-gray-400 text-sm">Cerrar</button>
            </div>
            {mensajes.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {mensajes.map((m) => (
                  <div key={m.id} className={`rounded-lg p-3 ${m.leido ? "bg-gray-50" : "bg-navy-50 border border-navy/20"}`}>
                    <p className="text-sm text-gray-700">{m.mensaje}</p>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">{m.de_nombre || "Admin"}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(m.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No hay mensajes</p>
            )}
          </div>
        )}

        {/* Notification permission banner */}
        <div className="mt-3">
          <NotificationBanner mensaje="Activa las notificaciones para saber cuando llegue un pedido nuevo a tu tienda" />
        </div>

        {/* Announcements for stores */}
        {anunciosTienda.length > 0 && (
          <div className="mt-3 space-y-2">
            {anunciosTienda.slice(0, 3).map((a) => (
              <div key={a.id} className="bg-brand-light border border-brand/30 rounded-xl p-3">
                <p className="font-bold text-navy text-sm">{a.titulo}</p>
                <p className="text-xs text-brand-dark">{a.mensaje}</p>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════ TAB: PRECIOS ══════════════ */}
        {tab === "precios" && (
          <div className="mt-4">
            <div className="bg-navy-50 border border-navy/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-navy">
                <strong>Comision Mercadito:</strong> Se agrega entre 5-10% al precio que el cliente ve (min $1, max $50).
                Tu recibes el precio que pones aqui. Si quieres ser mas competitivo, baja tu precio.
              </p>
            </div>
            {loading ? (
              <div className="text-center py-12 text-gray-400">Cargando productos...</div>
            ) : (
              <>
                {/* Add product button */}
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="w-full mb-3 py-3 border-2 border-dashed border-brand text-brand-dark rounded-xl font-medium active:scale-95 transition-transform"
                >
                  {showAddForm ? "Cancelar" : "+ Agregar producto nuevo"}
                </button>

                {showAddForm && (
                  <div className="bg-brand-light rounded-xl p-4 mb-4 space-y-3 border border-brand/30">
                    {/* 1. Categoría primero */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">CATEGORIA</label>
                      <select
                        value={nuevoCategoria}
                        onChange={(e) => { setNuevoCategoria(e.target.value); setNuevoUnidad(""); }}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white text-base"
                      >
                        <option value="">Selecciona categoría...</option>
                        {Object.entries(CATEGORIAS_INFO).map(([id, cat]) => (
                          <option key={id} value={id}>{cat.icono} {cat.nombre}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Nombre */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">NOMBRE DEL PRODUCTO</label>
                      <input
                        type="text"
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        placeholder={nuevoCategoria === "farmacia" ? "Ej: Paracetamol 500mg" : nuevoCategoria === "restaurante" ? "Ej: Pollo en mole" : "Ej: Aguacate Hass"}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base bg-white"
                      />
                    </div>

                    {/* 3. Detalles/descripción */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        DETALLES <span className="font-normal text-gray-400">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={nuevoDescripcion}
                        onChange={(e) => setNuevoDescripcion(e.target.value)}
                        placeholder={nuevoCategoria === "farmacia" ? "Ej: Caja con 10 tabletas, genérico" : nuevoCategoria === "restaurante" ? "Ej: Incluye arroz, frijoles y tortillas" : "Ej: Tamaño grande, de temporada"}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white"
                      />
                    </div>

                    {/* 4. Foto */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">FOTO <span className="font-normal text-gray-400">(opcional)</span></label>
                      <div className="flex items-center gap-3">
                        {nuevoImagen ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={nuevoImagen} alt="Preview" className="w-16 h-16 rounded-lg object-cover border-2 border-brand/30" />
                            <button
                              onClick={() => setNuevoImagen("")}
                              className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
                            >
                              x
                            </button>
                          </div>
                        ) : null}
                        <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-3 text-center text-sm text-gray-500 cursor-pointer active:bg-gray-50">
                          📷 Tomar foto
                          <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                        </label>
                        <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-3 text-center text-sm text-gray-500 cursor-pointer active:bg-gray-50">
                          🖼️ Galeria
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      </div>
                    </div>

                    {/* 5. Unidad + Precio */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1">UNIDAD</label>
                        <select
                          value={nuevoUnidad}
                          onChange={(e) => setNuevoUnidad(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-white text-sm"
                        >
                          <option value="">Selecciona...</option>
                          {(nuevoCategoria ? getUnidadesParaCategoria(nuevoCategoria) : getUnidadesParaCategoria("otro")).map((u) => (
                            <option key={u.id} value={u.id}>{u.nombre}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1">PRECIO</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                          <input
                            type="number"
                            value={nuevoPrecioProducto}
                            onChange={(e) => setNuevoPrecioProducto(e.target.value)}
                            placeholder="0.00"
                            step="0.5"
                            className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={agregarProducto}
                      disabled={!nuevoNombre || !nuevoCategoria || !nuevoUnidad || !nuevoPrecioProducto}
                      className="w-full bg-brand text-white py-3 rounded-lg font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                    >
                      Agregar producto
                    </button>
                  </div>
                )}

                {/* Category filter */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-snap-x mb-4">
                  <button
                    onClick={() => setFiltroCategoria(null)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      !filtroCategoria ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    Todos ({misProductos.length})
                  </button>
                  {categorias.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFiltroCategoria(cat)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroCategoria === cat ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {CATEGORIAS_INFO[cat]?.icono || ""} {CATEGORIAS_INFO[cat]?.nombre || cat}
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
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {prod.imagen && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={prod.imagen} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <button
                                onClick={() => editarProducto(prod.id, "nombre", prod.nombre)}
                                className="font-bold text-gray-700 hover:underline text-left"
                              >
                                {prod.nombre}
                              </button>
                              <span className="text-xs text-gray-400 ml-1">/{prod.unidad}</span>
                              {prod.descripcion && <p className="text-xs text-gray-400 truncate">{prod.descripcion}</p>}
                            </div>
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
                                className="w-20 border border-brand/30 rounded-lg px-2 py-1 text-lg text-right focus:border-brand outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardarPrecio(prod.id);
                                  if (e.key === "Escape") { setEditando(null); setNuevoPrecio(""); }
                                }}
                              />
                              <button
                                onClick={() => guardarPrecio(prod.id)}
                                className="bg-brand text-white w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center"
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
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setEditando(prod.id); setNuevoPrecio(String(miPrecio?.precio ?? "")); }}
                                className="flex items-center gap-1 bg-brand-light px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                              >
                                <span className="font-bold text-brand-dark text-lg">
                                  ${miPrecio?.precio ?? "—"}
                                </span>
                              </button>
                              <button
                                onClick={() => eliminarProducto(prod.id, prod.nombre)}
                                className="text-gray-300 w-8 h-8 flex items-center justify-center text-lg active:text-red-500"
                                title="Eliminar producto"
                              >
                                ✕
                              </button>
                            </div>
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
                              className="text-xs bg-brand-light text-brand-dark px-3 py-1 rounded-full font-medium"
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
                                className="flex-1 border border-brand/30 rounded-lg px-2 py-1 text-lg focus:border-brand outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardarPrecio(prod.id);
                                  if (e.key === "Escape") { setEditando(null); setNuevoPrecio(""); }
                                }}
                              />
                              <button
                                onClick={() => guardarPrecio(prod.id)}
                                className="bg-brand text-white px-4 py-1 rounded-lg font-bold"
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
                        const misItems = pedido.items.filter((item) => item.puesto_id === usuario.puesto_id);
                        const miSubtotal = misItems.reduce((sum, item) => {
                          const cant = parseFloat(String(item.cantidad));
                          const com = parseFloat(String(item.comision || 0)) || 2; // fallback $2 for old orders
                          const precioSinComision = parseFloat(String(item.precio_unitario)) - com;
                          return sum + cant * precioSinComision;
                        }, 0);
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
                              <span className="font-bold text-brand-dark">
                                ${miSubtotal.toFixed(2)}
                              </span>
                            </div>

                            <p className="text-xs text-gray-400 mb-1">
                              {new Date(pedido.created_at).toLocaleString("es-MX")}
                            </p>

                            {pedido.repartidor_nombre ? (
                              <p className="text-xs mb-2">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                  🛵 {pedido.repartidor_nombre} va por tu pedido
                                </span>
                              </p>
                            ) : (
                              <p className="text-xs mb-2">
                                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                  Esperando repartidor...
                                </span>
                              </p>
                            )}

                            {/* Items from this store */}
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-bold text-gray-500 mb-1">PRODUCTOS:</p>
                              {misItems.map((item) => {
                                const cant = parseFloat(String(item.cantidad));
                                const com = parseFloat(String(item.comision || 0)) || 2;
                                const precioSinCom = parseFloat(String(item.precio_unitario)) - com;
                                return (
                                  <div key={item.id} className="flex justify-between text-sm py-0.5">
                                    <span className="text-gray-700">
                                      {cant} {item.unidad} {item.producto_nombre}
                                    </span>
                                    <span className="text-gray-500">
                                      ${(cant * precioSinCom).toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
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
                      {pedidosRecientes.map((pedido) => {
                        const miSub = pedido.items
                          .filter((item) => item.puesto_id === usuario.puesto_id)
                          .reduce((sum, item) => {
                            const cant = parseFloat(String(item.cantidad));
                            const com = parseFloat(String(item.comision || 0)) || 2;
                            const precioSinCom = parseFloat(String(item.precio_unitario)) - com;
                            return sum + cant * precioSinCom;
                          }, 0);
                        return (
                        <div key={pedido.id} className="bg-white rounded-xl p-3 shadow-sm opacity-60">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-600">{pedido.cliente_nombre}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {new Date(pedido.created_at).toLocaleDateString("es-MX")}
                              </span>
                            </div>
                            <span className="font-medium text-gray-500">
                              ${miSub.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={fetchPedidos}
                  className="w-full mt-4 py-3 border-2 border-brand text-brand-dark rounded-full font-medium active:scale-95 transition-transform"
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
            <div className="bg-brand-light border border-brand/30 rounded-xl p-4 mb-4">
              <p className="text-sm text-navy">
                <strong>Tu catálogo:</strong> {misProductos.length} productos con precio.
                Los clientes solo ven productos que tienen precio asignado.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-brand-dark">{misProductos.length}</p>
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
                    {CATEGORIAS_INFO[cat]?.icono || ""} {CATEGORIAS_INFO[cat]?.nombre || cat} ({prodsEnCat.length})
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
                          <span className="font-bold text-brand-dark">${miPrecio?.precio ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════ TAB: MI TIENDA ══════════════ */}
        {tab === "mitienda" && (
          <div className="mt-4 space-y-4">
            {/* Map */}
            <div>
              <h3 className="font-bold text-gray-700 mb-2">¿Dónde esta tu tienda?</h3>
              <MapaUbicacionTienda
                ubicacionInicial={tiendaUbicacion}
                onUbicacionSeleccionada={(lat, lng) => setTiendaUbicacion({ lat, lng })}
                onDireccionDetectada={(dir) => setTiendaDireccion(dir)}
              />
            </div>

            {/* Store info form */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-700">Datos de tu tienda</h3>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nombre de la tienda</label>
                <input
                  type="text"
                  value={tiendaNombre}
                  onChange={(e) => setTiendaNombre(e.target.value)}
                  placeholder="Ej: Frutas Don Luis"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">WhatsApp / Teléfono</label>
                <input
                  type="tel"
                  value={tiendaTelefono}
                  onChange={(e) => setTiendaTelefono(e.target.value)}
                  placeholder="353 123 4567"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Dirección</label>
                {tiendaDireccion ? (
                  <p className="bg-gray-100 rounded-lg px-4 py-3 text-gray-700">{tiendaDireccion}</p>
                ) : (
                  <p className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700">
                    Toca el mapa o usa &quot;Mi ubicacion&quot; para obtener tu direccion
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">No. de calle, local o puesto</label>
                <input
                  type="text"
                  value={tiendaNumeroLocal}
                  onChange={(e) => setTiendaNumeroLocal(e.target.value)}
                  placeholder="Ej: Local 15, Puesto 3, Nave B..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Referencias <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={tiendaReferencias}
                  onChange={(e) => setTiendaReferencias(e.target.value)}
                  placeholder="Ej: Frente a la entrada principal, junto a los tacos..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                />
              </div>
            </div>

            {/* Store category tags */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-700">Tipo de tienda</h3>
              <p className="text-xs text-gray-400">Selecciona hasta 5 categorias que describan tu tienda. Asi los clientes te encuentran mas facil.</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORIAS_INFO).map(([id, info]) => {
                  const selected = tiendaCategorias.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          setTiendaCategorias(tiendaCategorias.filter((c) => c !== id));
                        } else if (tiendaCategorias.length < 5) {
                          setTiendaCategorias([...tiendaCategorias, id]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selected
                          ? "bg-brand text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {info.icono} {info.nombre}
                    </button>
                  );
                })}
              </div>
              {tiendaCategorias.length === 0 && (
                <p className="text-xs text-brand-dark">Selecciona al menos una categoria</p>
              )}
            </div>

            <button
              onClick={guardarDatosTienda}
              disabled={guardandoTienda || !tiendaNombre || !tiendaDireccion || !tiendaNumeroLocal || !tiendaTelefono}
              className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
            >
              {guardandoTienda
                ? "Guardando..."
                : !tiendaNombre
                ? "Escribe el nombre de tu tienda"
                : !tiendaTelefono
                ? "Escribe tu WhatsApp"
                : !tiendaDireccion
                ? "Marca tu tienda en el mapa"
                : !tiendaNumeroLocal
                ? "Escribe el no. de local"
                : "Guardar cambios"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
