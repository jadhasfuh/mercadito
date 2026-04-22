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
            <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
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
  const [filtroSubseccion, setFiltroSubseccion] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editSeccion, setEditSeccion] = useState("");
  const [editSubseccion, setEditSubseccion] = useState("");

  // Store info
  const [tiendaNombre, setTiendaNombre] = useState("");
  const [tiendaDireccion, setTiendaDireccion] = useState("");
  const [tiendaNumeroLocal, setTiendaNumeroLocal] = useState("");
  const [tiendaTelefono, setTiendaTelefono] = useState("");
  const [tiendaReferencias, setTiendaReferencias] = useState("");
  const [tiendaUbicacion, setTiendaUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [tiendaLogo, setTiendaLogo] = useState("");
  const [guardandoTienda, setGuardandoTienda] = useState(false);
  const [tiendaCargada, setTiendaCargada] = useState(false);
  const [tiendaDesactivada, setTiendaDesactivada] = useState(false);
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
  const [nuevoSeccion, setNuevoSeccion] = useState("");
  const [nuevoSubseccion, setNuevoSubseccion] = useState("");
  const [nuevoHorarioIds, setNuevoHorarioIds] = useState<string[]>([]);

  // Store schedules (puesto_horarios)
  const [horarios, setHorarios] = useState<{ id: string; nombre: string; desde: string; hasta: string }[]>([]);
  const [horarioNombre, setHorarioNombre] = useState("");
  const [horarioDesde, setHorarioDesde] = useState("");
  const [horarioHasta, setHorarioHasta] = useState("");
  const [horarioGuardando, setHorarioGuardando] = useState(false);

  // Opening hours (horario de atencion) — 7 days (0=dom ... 6=sab)
  type DiaHorario = { dia_semana: number; abre: string | null; cierra: string | null };
  const atencionVacia = () =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, abre: null, cierra: null }));
  const [atencion, setAtencion] = useState<DiaHorario[]>(atencionVacia);
  const [atencionOriginal, setAtencionOriginal] = useState<DiaHorario[]>(atencionVacia);
  const [atencionGuardando, setAtencionGuardando] = useState(false);
  const atencionModificada = JSON.stringify(atencion) !== JSON.stringify(atencionOriginal);

  const prevPedidosRef = useRef(0);

  // (notification permission handled by NotificationBanner component)

  useEffect(() => {
    fetchProductos();
    fetch("/api/anuncios?tipo=tiendas").then((r) => r.json()).then(setAnunciosTienda).catch(() => {});
    fetch("/api/mensajes").then((r) => r.json()).then(setMensajes).catch(() => {});
    fetch("/api/puestos/horarios").then((r) => r.json()).then(setHorarios).catch(() => {});
    fetch("/api/puestos/horario-atencion").then((r) => r.json()).then((rows: DiaHorario[]) => {
      const base = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, abre: null as string | null, cierra: null as string | null }));
      for (const r of rows) {
        const idx = base.findIndex((x) => x.dia_semana === r.dia_semana);
        if (idx >= 0) base[idx] = { dia_semana: r.dia_semana, abre: r.abre, cierra: r.cierra };
      }
      setAtencion(base);
      setAtencionOriginal(base.map((d) => ({ ...d })));
    }).catch(() => {});
  }, []);

  async function guardarHorarioAtencion() {
    setAtencionGuardando(true);
    const res = await fetch("/api/puestos/horario-atencion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias: atencion }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Error al guardar horario de atencion");
    } else {
      setAtencionOriginal(atencion.map((d) => ({ ...d })));
      alert("Horario de atencion guardado");
    }
    setAtencionGuardando(false);
  }

  async function agregarHorario() {
    if (!horarioNombre.trim() || !horarioDesde || !horarioHasta) {
      alert("Nombre, desde y hasta son requeridos");
      return;
    }
    if (horarioDesde >= horarioHasta) {
      alert("La hora de inicio debe ser menor a la de fin");
      return;
    }
    setHorarioGuardando(true);
    const res = await fetch("/api/puestos/horarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: horarioNombre.trim(), desde: horarioDesde, hasta: horarioHasta }),
    });
    if (res.ok) {
      const data = await fetch("/api/puestos/horarios").then((r) => r.json());
      setHorarios(data);
      setHorarioNombre(""); setHorarioDesde(""); setHorarioHasta("");
    } else {
      const data = await res.json();
      alert(data.error || "Error al guardar horario");
    }
    setHorarioGuardando(false);
  }

  async function eliminarHorario(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el horario "${nombre}"? Los productos que lo usen quedaran sin horario.`)) return;
    const res = await fetch(`/api/puestos/horarios/${id}`, { method: "DELETE" });
    if (res.ok) {
      setHorarios(horarios.filter((h) => h.id !== id));
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo eliminar");
    }
  }

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
            setTiendaLogo(mi.logo || "");
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
        seccion: nuevoSeccion || undefined,
        subseccion: nuevoSubseccion || undefined,
        precio: parseFloat(nuevoPrecioProducto),
        puesto_id: usuario.puesto_id,
        horario_ids: nuevoHorarioIds.length > 0 ? nuevoHorarioIds : undefined,
      }),
    });
    if (res.ok) {
      setNuevoNombre("");
      setNuevoCategoria("");
      setNuevoUnidad("");
      setNuevoDescripcion("");
      setNuevoImagen("");
      setNuevoPrecioProducto("");
      setNuevoSeccion("");
      setNuevoSubseccion("");
      setNuevoHorarioIds([]);
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

  async function editarProducto(productoId: string, campos: Record<string, unknown>) {
    const res = await fetch(`/api/productos/${productoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    if (res.ok) {
      fetchProductos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo editar");
    }
  }

  function handleEditImage(productoId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { alert("Imagen muy grande. Maximo 5MB."); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      editarProducto(productoId, { imagen: compressed });
    };
    img.src = URL.createObjectURL(file);
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

  // Build filter options: sections first (if any), then categories
  const secciones = [...new Set(misProductos.map((p) => p.seccion).filter(Boolean))] as string[];
  const categorias = [...new Set(misProductos.map((p) => p.categoria_id))];

  const productosFiltradosPorSeccion = !filtroCategoria
    ? misProductos
    : secciones.includes(filtroCategoria)
    ? misProductos.filter((p) => p.seccion === filtroCategoria)
    : misProductos.filter((p) => p.categoria_id === filtroCategoria && (!p.seccion || !secciones.includes(p.seccion)));

  const subseccionesDisponibles = [...new Set(productosFiltradosPorSeccion.map((p) => p.subseccion).filter(Boolean))] as string[];

  const productosFiltrados = filtroSubseccion
    ? productosFiltradosPorSeccion.filter((p) => (p.subseccion || "Otros") === filtroSubseccion)
    : productosFiltradosPorSeccion;

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
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
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

                    {/* 3.5 Seccion/marca */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        SECCION / MARCA <span className="font-normal text-gray-400">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={nuevoSeccion}
                        onChange={(e) => setNuevoSeccion(e.target.value)}
                        placeholder="Ej: Coca Cola, Bimbo, Lacteos..."
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white"
                      />
                      {secciones.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {secciones.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setNuevoSeccion(s)}
                              className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                                nuevoSeccion === s ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">Ej: Little Caesars, Coca Cola, Bimbo</p>
                    </div>

                    {/* 3.6 Subseccion */}
                    {nuevoSeccion && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        SUBSECCION <span className="font-normal text-gray-400">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={nuevoSubseccion}
                        onChange={(e) => setNuevoSubseccion(e.target.value)}
                        placeholder="Ej: Pizzas, Bebidas, Complementos..."
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white"
                      />
                      {(() => {
                        const subsExistentes = [...new Set(misProductos.filter((p) => p.seccion === nuevoSeccion && p.subseccion).map((p) => p.subseccion!))] ;
                        if (subsExistentes.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {subsExistentes.map((s) => (
                              <button key={s} type="button" onClick={() => setNuevoSubseccion(s)}
                                className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${nuevoSubseccion === s ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                              >{s}</button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    )}

                    {/* 3.7 Horarios disponibles */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        DISPONIBLE EN <span className="font-normal text-gray-400">(opcional, vacio = todo el dia)</span>
                      </label>
                      {horarios.length === 0 ? (
                        <p className="text-[11px] text-gray-400">Aun no has creado horarios. Crealos en &quot;Mi tienda&quot; &rarr; Horarios del menú.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {horarios.map((h) => {
                            const sel = nuevoHorarioIds.includes(h.id);
                            return (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() =>
                                  setNuevoHorarioIds(sel ? nuevoHorarioIds.filter((x) => x !== h.id) : [...nuevoHorarioIds, h.id])
                                }
                                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${sel ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                              >
                                {h.nombre} {h.desde}-{h.hasta}
                              </button>
                            );
                          })}
                        </div>
                      )}
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

                {/* Category/section filter */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-snap-x mb-4">
                  <button
                    onClick={() => { setFiltroCategoria(null); setFiltroSubseccion(null); }}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      !filtroCategoria ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    Todos ({misProductos.length})
                  </button>
                  {secciones.map((sec) => (
                    <button
                      key={`sec-${sec}`}
                      onClick={() => { setFiltroCategoria(sec); setFiltroSubseccion(null); }}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroCategoria === sec ? "bg-brand text-white" : "bg-white text-gray-600 border border-gray-200"
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                  {categorias.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setFiltroCategoria(cat); setFiltroSubseccion(null); }}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroCategoria === cat ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {CATEGORIAS_INFO[cat]?.icono || ""} {CATEGORIAS_INFO[cat]?.nombre || cat}
                    </button>
                  ))}
                </div>

                {/* Subsection filter */}
                {subseccionesDisponibles.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-snap-x mb-3">
                    <button
                      onClick={() => setFiltroSubseccion(null)}
                      className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        !filtroSubseccion ? "bg-brand-dark text-white" : "bg-gray-50 text-gray-400 border border-gray-200"
                      }`}
                    >
                      Todo
                    </button>
                    {subseccionesDisponibles.map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setFiltroSubseccion(filtroSubseccion === sub ? null : sub)}
                        className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          filtroSubseccion === sub ? "bg-brand-dark text-white" : "bg-gray-50 text-gray-400 border border-gray-200"
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}

                {/* Products with prices */}
                <div className="space-y-2">
                  {productosFiltrados.map((prod) => {
                    const miPrecio = prod.precios.find((pr) => pr.puesto_id === usuario.puesto_id);
                    const isEditing = editando === prod.id;
                    const isExpanded = expandido === prod.id;

                    return (
                      <div key={prod.id} className={`bg-white rounded-xl shadow-sm overflow-hidden ${prod.disponible === false ? "opacity-50" : ""}`}>
                        {/* Main row - tap to expand */}
                        <div
                          onClick={() => {
                            if (isExpanded) {
                              setExpandido(null);
                            } else {
                              setExpandido(prod.id);
                              setEditNombre(prod.nombre);
                              setEditDescripcion(prod.descripcion || "");
                              setEditSeccion(prod.seccion || "");
                              setEditSubseccion(prod.subseccion || "");
                              setEditando(null);
                              setNuevoPrecio("");
                            }
                          }}
                          className="w-full flex items-center justify-between p-3 text-left active:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {prod.imagen ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={prod.imagen} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-gray-300 text-lg">📷</span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-gray-700">{prod.nombre}</p>
                              <p className="text-xs text-gray-400">
                                /{prod.unidad}{prod.descripcion ? ` — ${prod.descripcion}` : ""}
                                {prod.seccion && <span className="ml-1 text-brand-dark font-medium">({prod.seccion}{prod.subseccion ? ` / ${prod.subseccion}` : ""})</span>}
                                {prod.disponible === false && <span className="ml-1 text-red-500 font-medium">PAUSADO</span>}
                                {prod.horarios && prod.horarios.length > 0 && <span className="ml-1 text-gray-400">({prod.horarios.map((h) => h.nombre).join(", ")})</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-bold text-brand-dark text-lg">${miPrecio?.precio ?? "—"}</span>
                            <span className={`text-gray-300 text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                          </div>
                        </div>

                        {/* Expanded edit panel */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
                            {/* Price edit */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">PRECIO</label>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">$</span>
                                <input
                                  type="number"
                                  value={isEditing ? nuevoPrecio : ""}
                                  onChange={(e) => { setEditando(prod.id); setNuevoPrecio(e.target.value); }}
                                  onFocus={() => { if (!isEditing) { setEditando(prod.id); setNuevoPrecio(String(miPrecio?.precio ?? "")); }}}
                                  placeholder={String(miPrecio?.precio ?? "0.00")}
                                  step="0.5"
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-lg focus:border-brand outline-none bg-white"
                                />
                                <button
                                  onClick={() => { if (nuevoPrecio) { guardarPrecio(prod.id); } }}
                                  disabled={!isEditing || !nuevoPrecio}
                                  className="bg-brand text-white px-4 py-2 rounded-lg font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>

                            {/* Name edit */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">NOMBRE</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editNombre}
                                  onChange={(e) => setEditNombre(e.target.value)}
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none bg-white"
                                />
                                <button
                                  onClick={() => {
                                    if (editNombre && editNombre !== prod.nombre) {
                                      editarProducto(prod.id, { nombre: editNombre });
                                    }
                                  }}
                                  disabled={!editNombre || editNombre === prod.nombre}
                                  className="bg-brand text-white px-3 py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>

                            {/* Description edit */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">DESCRIPCION</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editDescripcion}
                                  onChange={(e) => setEditDescripcion(e.target.value)}
                                  placeholder="Ej: Caja con 10 tabletas..."
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none bg-white"
                                />
                                <button
                                  onClick={() => {
                                    if (editDescripcion !== (prod.descripcion || "")) {
                                      editarProducto(prod.id, { descripcion: editDescripcion });
                                    }
                                  }}
                                  disabled={editDescripcion === (prod.descripcion || "")}
                                  className="bg-brand text-white px-3 py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>

                            {/* Section/brand */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">SECCION / MARCA</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editSeccion}
                                  onChange={(e) => setEditSeccion(e.target.value)}
                                  placeholder="Ej: Coca Cola, Bimbo, Lacteos..."
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none bg-white"
                                />
                                <button
                                  onClick={() => {
                                    if (editSeccion !== (prod.seccion || "")) {
                                      editarProducto(prod.id, { seccion: editSeccion });
                                    }
                                  }}
                                  disabled={editSeccion === (prod.seccion || "")}
                                  className="bg-brand text-white px-3 py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                                >
                                  Guardar
                                </button>
                              </div>
                              {secciones.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {secciones.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => setEditSeccion(s)}
                                      className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                                        editSeccion === s ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                                      }`}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Subsection */}
                            {editSeccion && (
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">SUBSECCION</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editSubseccion}
                                  onChange={(e) => setEditSubseccion(e.target.value)}
                                  placeholder="Ej: Pizzas, Bebidas, Complementos..."
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-brand outline-none bg-white"
                                />
                                <button
                                  onClick={() => {
                                    if (editSubseccion !== (prod.subseccion || "")) {
                                      editarProducto(prod.id, { subseccion: editSubseccion });
                                    }
                                  }}
                                  disabled={editSubseccion === (prod.subseccion || "")}
                                  className="bg-brand text-white px-3 py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:bg-gray-300"
                                >
                                  Guardar
                                </button>
                              </div>
                              {(() => {
                                const subsExistentes = [...new Set(misProductos.filter((p) => p.seccion === editSeccion && p.subseccion).map((p) => p.subseccion!))] ;
                                if (subsExistentes.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {subsExistentes.map((s) => (
                                      <button key={s} type="button" onClick={() => setEditSubseccion(s)}
                                        className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${editSubseccion === s ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                                      >{s}</button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                            )}

                            {/* Availability toggle + schedule */}
                            <div className="bg-gray-100 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-500">DISPONIBLE</label>
                                <button
                                  onClick={() => editarProducto(prod.id, { disponible: !prod.disponible })}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${prod.disponible !== false ? "bg-green-500" : "bg-gray-300"}`}
                                >
                                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prod.disponible !== false ? "left-6" : "left-0.5"}`} />
                                </button>
                              </div>
                              {prod.disponible !== false && (
                                <div>
                                  <p className="text-[10px] text-gray-400 mb-1">Disponible en (vacio = todo el dia)</p>
                                  {horarios.length === 0 ? (
                                    <p className="text-[11px] text-gray-400">Crea horarios en &quot;Mi tienda&quot; &rarr; Horarios del menú.</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {horarios.map((h) => {
                                        const actuales = prod.horarios?.map((x) => x.id) || [];
                                        const sel = actuales.includes(h.id);
                                        return (
                                          <button
                                            key={h.id}
                                            type="button"
                                            onClick={() => {
                                              const nuevos = sel ? actuales.filter((x) => x !== h.id) : [...actuales, h.id];
                                              editarProducto(prod.id, { horario_ids: nuevos });
                                            }}
                                            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${sel ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                                          >
                                            {h.nombre} {h.desde}-{h.hasta}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Photo */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">FOTO</label>
                              <div className="flex items-center gap-2">
                                {prod.imagen && (
                                  <div className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={prod.imagen} alt="" className="w-14 h-14 rounded-lg object-cover" />
                                    <button
                                      onClick={() => editarProducto(prod.id, { imagen: null })}
                                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                                    >
                                      x
                                    </button>
                                  </div>
                                )}
                                <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-center text-xs text-gray-500 cursor-pointer active:bg-gray-50">
                                  📷 Camara
                                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleEditImage(prod.id, e)} className="hidden" />
                                </label>
                                <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-center text-xs text-gray-500 cursor-pointer active:bg-gray-50">
                                  🖼️ Galeria
                                  <input type="file" accept="image/*" onChange={(e) => handleEditImage(prod.id, e)} className="hidden" />
                                </label>
                              </div>
                            </div>

                            {/* Delete */}
                            <button
                              onClick={() => { eliminarProducto(prod.id, prod.nombre); setExpandido(null); }}
                              className="w-full py-2.5 bg-red-50 text-red-600 rounded-lg text-sm font-bold active:scale-95 transition-transform border border-red-200"
                            >
                              Eliminar producto
                            </button>
                          </div>
                        )}
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

            {/* Store logo */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-700">Logo de tu tienda</h3>
              <div className="flex items-center gap-3">
                {tiendaLogo ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tiendaLogo} alt="Logo" className="w-16 h-16 rounded-xl object-cover border-2 border-brand/30" />
                    <button
                      onClick={async () => {
                        setTiendaLogo("");
                        await fetch("/api/puestos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo: null }) });
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center">
                    <span className="text-2xl text-gray-300">🏪</span>
                  </div>
                )}
                <div className="flex-1 flex gap-2">
                  <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-center text-xs text-gray-500 cursor-pointer active:bg-gray-50">
                    📷 Camara
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5_000_000) { alert("Imagen muy grande. Max 5MB."); return; }
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement("canvas");
                        const MAX = 400;
                        let w = img.width, h = img.height;
                        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
                        canvas.width = w; canvas.height = h;
                        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                        const compressed = canvas.toDataURL("image/jpeg", 0.7);
                        setTiendaLogo(compressed);
                        fetch("/api/puestos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo: compressed }) });
                      };
                      img.src = URL.createObjectURL(file);
                    }} className="hidden" />
                  </label>
                  <label className="flex-1 bg-white border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-center text-xs text-gray-500 cursor-pointer active:bg-gray-50">
                    🖼️ Galeria
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5_000_000) { alert("Imagen muy grande. Max 5MB."); return; }
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement("canvas");
                        const MAX = 400;
                        let w = img.width, h = img.height;
                        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
                        canvas.width = w; canvas.height = h;
                        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                        const compressed = canvas.toDataURL("image/jpeg", 0.7);
                        setTiendaLogo(compressed);
                        fetch("/api/puestos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo: compressed }) });
                      };
                      img.src = URL.createObjectURL(file);
                    }} className="hidden" />
                  </label>
                </div>
              </div>
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

            {/* Horario de atencion (cuando esta abierta la tienda) */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div>
                <h3 className="font-bold text-gray-700">Horario de atencion</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tu tienda aparece &quot;Cerrada&quot; al cliente fuera de este horario. Dejalo vacio para todos los dias si abres 24h.
                </p>
              </div>
              <div className="space-y-1.5">
                {(["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"] as const).map((nombreDia, i) => {
                  const order = [1, 2, 3, 4, 5, 6, 0][i];
                  const dia = atencion.find((d) => d.dia_semana === order)!;
                  const cerrado = !dia.abre && !dia.cierra;
                  const nombreReal = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"][order];
                  return (
                    <div key={order} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-medium text-gray-600">{nombreReal}</span>
                      <button
                        onClick={() => {
                          setAtencion(atencion.map((d) =>
                            d.dia_semana === order
                              ? cerrado
                                ? { ...d, abre: "08:00", cierra: "22:00" }
                                : { ...d, abre: null, cierra: null }
                              : d
                          ));
                        }}
                        className={`text-[10px] px-2 py-1 rounded-full ${cerrado ? "bg-gray-100 text-gray-400" : "bg-green-100 text-green-700"}`}
                      >
                        {cerrado ? "Cerrado" : "Abierto"}
                      </button>
                      {!cerrado && (
                        <>
                          <input
                            type="time"
                            value={dia.abre || ""}
                            onChange={(e) => setAtencion(atencion.map((d) =>
                              d.dia_semana === order ? { ...d, abre: e.target.value || null } : d
                            ))}
                            className="flex-1 min-w-0 border border-gray-300 rounded px-1 py-1 text-xs bg-white"
                          />
                          <span className="text-[10px] text-gray-400">a</span>
                          <input
                            type="time"
                            value={dia.cierra || ""}
                            onChange={(e) => setAtencion(atencion.map((d) =>
                              d.dia_semana === order ? { ...d, cierra: e.target.value || null } : d
                            ))}
                            className="flex-1 min-w-0 border border-gray-300 rounded px-1 py-1 text-xs bg-white"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={guardarHorarioAtencion}
                disabled={atencionGuardando || !atencionModificada}
                className="w-full bg-brand text-white py-2 rounded-lg text-sm font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
              >
                {atencionGuardando ? "Guardando..." : "Guardar horario de atencion"}
              </button>
            </div>

            {/* Horarios del menú */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div>
                <h3 className="font-bold text-gray-700">Horarios del menú</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Crea rangos como &quot;Desayuno&quot; o &quot;Tarde&quot; y asignalos a tus productos. Fuera de horario no aparecen al cliente.
                </p>
              </div>

              {horarios.length > 0 && (
                <div className="space-y-1.5">
                  {horarios.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-700 truncate">{h.nombre}</p>
                        <p className="text-xs text-gray-400">{h.desde} – {h.hasta}</p>
                      </div>
                      <button
                        onClick={() => eliminarHorario(h.id, h.nombre)}
                        className="text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-bold text-gray-500">AGREGAR HORARIO</p>
                <input
                  type="text"
                  value={horarioNombre}
                  onChange={(e) => setHorarioNombre(e.target.value)}
                  placeholder="Nombre (ej. Desayuno, Comida, Tarde)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={horarioDesde}
                    onChange={(e) => setHorarioDesde(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  />
                  <span className="text-xs text-gray-400">a</span>
                  <input
                    type="time"
                    value={horarioHasta}
                    onChange={(e) => setHorarioHasta(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  />
                </div>
                <button
                  onClick={agregarHorario}
                  disabled={horarioGuardando || !horarioNombre.trim() || !horarioDesde || !horarioHasta}
                  className="w-full bg-brand text-white py-2 rounded-lg text-sm font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
                >
                  {horarioGuardando ? "Guardando..." : "Agregar horario"}
                </button>
              </div>
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
