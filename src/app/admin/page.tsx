"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "@/components/SessionProvider";
import { showNotification, playBeep } from "@/lib/notifications";
import NotificationBanner from "@/components/NotificationBanner";

const MapaTiendasAdmin = dynamic(() => import("@/components/MapaTiendasAdmin"), { ssr: false });
const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

type Tab = "resumen" | "finanzas" | "tiendas" | "repartidores" | "anuncios";

interface Stats {
  totales: {
    total_pedidos: number;
    entregados: number;
    cancelados: number;
    activos: number;
    ventas_total: number;
    subtotal_productos: number;
    ingresos_envio: number;
    ingresos_comisiones: number;
    clientes_unicos: number;
  };
  ventasPorDia: { fecha: string; pedidos: number; total: number; envios: number }[];
  ventasPorTienda: { puesto_id: string; puesto_nombre: string; pedidos: number; total_vendido: number; comision_total: number }[];
  ventasPorRepartidor: { repartidor: string; pedidos_entregados: number; total: number; envios: number }[];
  topProductos: { producto: string; cantidad_total: number; total_vendido: number }[];
  tiendasPendientes: { id: string; nombre: string; descripcion: string; nombre_dueno: string; telefono_dueno: string; usuario_id: string }[];
  tiendasActivas: { id: string; nombre: string; descripcion: string; activo: boolean; lat: number | null; lng: number | null; ubicacion: string | null; telefono_contacto: string | null; usuario_id: string; nombre_dueno: string; telefono_dueno: string; rol_dueno: string; total_productos: number }[];
}

export default function AdminPage() {
  const { usuario, loading: sessionLoading, logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!usuario || usuario.rol !== "admin") router.replace("/admin/login");
  }, [usuario, sessionLoading, router]);

  if (sessionLoading || !usuario || usuario.rol !== "admin") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-gray-400">{sessionLoading ? "Cargando..." : "Redirigiendo..."}</p>
      </div>
    );
  }

  return <AdminDashboard onLogout={logout} />;
}

interface Anuncio {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  activo: boolean;
  created_at: string;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("resumen");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const prevPendientesRef = useRef(0);

  // Announcements state
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [nuevoAnuncioTitulo, setNuevoAnuncioTitulo] = useState("");
  const [nuevoAnuncioMensaje, setNuevoAnuncioMensaje] = useState("");
  const [nuevoAnuncioTipo, setNuevoAnuncioTipo] = useState("general");
  const [creandoAnuncio, setCreandoAnuncio] = useState(false);

  // Messaging state
  const [mensajePuesto, setMensajePuesto] = useState<string | null>(null); // puesto_id to message
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  // Store detail view
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      const data = await res.json();

      // Notify on new pending stores
      const pendientes = data.tiendasPendientes?.length || 0;
      if (prevPendientesRef.current > 0 && pendientes > prevPendientesRef.current) {
        playBeep(700, 0.4);
        showNotification(
          "Mercadito - Nueva tienda pendiente",
          "Hay una nueva tienda esperando aprobacion",
          "/admin"
        );
      }
      prevPendientesRef.current = pendientes;

      setStats(data);
    }
    setLoading(false);
  }

  // Auto-refresh admin stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAnuncios() {
    const res = await fetch("/api/anuncios");
    if (res.ok) setAnuncios(await res.json());
  }

  async function crearAnuncio() {
    if (!nuevoAnuncioTitulo || !nuevoAnuncioMensaje) return;
    setCreandoAnuncio(true);
    const res = await fetch("/api/anuncios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: nuevoAnuncioTitulo, mensaje: nuevoAnuncioMensaje, tipo: nuevoAnuncioTipo }),
    });
    if (res.ok) {
      setNuevoAnuncioTitulo("");
      setNuevoAnuncioMensaje("");
      fetchAnuncios();
    }
    setCreandoAnuncio(false);
  }

  async function toggleAnuncio(id: string, activo: boolean) {
    await fetch("/api/anuncios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo }),
    });
    fetchAnuncios();
  }

  async function eliminarAnuncio(id: string) {
    if (!confirm("Eliminar este anuncio?")) return;
    await fetch("/api/anuncios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAnuncios();
  }

  async function enviarMensaje(puestoId: string) {
    if (!mensajeTexto.trim()) return;
    setEnviandoMensaje(true);
    const res = await fetch("/api/mensajes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para_puesto_id: puestoId, mensaje: mensajeTexto }),
    });
    if (res.ok) {
      setMensajeTexto("");
      setMensajePuesto(null);
      alert("Mensaje enviado");
    }
    setEnviandoMensaje(false);
  }

  // Fetch announcements when tab switches
  useEffect(() => {
    if (tab === "anuncios") fetchAnuncios();
  }, [tab]);

  async function aprobarTienda(puestoId: string, aprobado: boolean) {
    const res = await fetch("/api/tiendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId, aprobado }),
    });
    if (res.ok) fetchStats();
  }

  async function resetPin(usuarioId: string, nombre: string) {
    const nuevoPin = prompt(`Nuevo PIN para ${nombre} (4-6 digitos):`);
    if (!nuevoPin || nuevoPin.length < 4) return;
    const res = await fetch("/api/admin/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: usuarioId, nuevo_pin: nuevoPin }),
    });
    if (res.ok) {
      alert(`PIN de ${nombre} actualizado a: ${nuevoPin}`);
    } else {
      alert("Error al cambiar PIN");
    }
  }

  const t = stats?.totales;
  // Ganancia = ingresos por envío + comisiones
  // Pago a tiendas = subtotal de productos - comisiones
  const gananciaEnvios = t?.ingresos_envio ?? 0;
  const gananciaComisiones = t?.ingresos_comisiones ?? 0;
  const pagoTiendas = (t?.subtotal_productos ?? 0) - gananciaComisiones;

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
            <h1 className="text-lg font-bold">Admin Mercadito</h1>
          </div>
          <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-lg mx-auto flex bg-white border-b sticky top-14 z-30 overflow-x-auto">
        {([
          { id: "resumen" as Tab, label: "Resumen", icon: "📊" },
          { id: "finanzas" as Tab, label: "Finanzas", icon: "💰" },
          { id: "tiendas" as Tab, label: "Tiendas", icon: "🏪", badge: stats?.tiendasPendientes.length || undefined },
          { id: "repartidores" as Tab, label: "Equipo", icon: "🛵" },
          { id: "anuncios" as Tab, label: "Anuncios", icon: "📢" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-xs border-b-2 transition-colors relative min-w-0 ${
              tab === t.id ? "border-brand text-brand-dark" : "border-transparent text-gray-400"
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="block text-[10px] mt-0.5">{t.label}</span>
            {t.badge ? (
              <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 pb-8">
        <div className="mt-3">
          <NotificationBanner mensaje="Activa las notificaciones para saber cuando se registre una nueva tienda" />
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando datos...</div>
        ) : !stats ? (
          <div className="text-center py-12 text-gray-400">Error al cargar</div>
        ) : (
          <>
            {/* ══════════════ TAB: RESUMEN ══════════════ */}
            {tab === "resumen" && (
              <div className="mt-4">
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-navy">{t!.entregados}</p>
                    <p className="text-xs text-gray-400">Pedidos entregados</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-green-600">${t!.ventas_total.toFixed(0)}</p>
                    <p className="text-xs text-gray-400">Ventas totales</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-amber-600">{t!.activos}</p>
                    <p className="text-xs text-gray-400">Pedidos activos</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-purple-600">{t!.clientes_unicos}</p>
                    <p className="text-xs text-gray-400">Clientes</p>
                  </div>
                </div>

                {/* Quick P&L */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Resumen financiero</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ventas totales</span>
                      <span className="font-bold">${t!.ventas_total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pago a tiendas (productos)</span>
                      <span className="font-bold text-red-600">-${pagoTiendas.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-500">Ganancia envios</span>
                      <span className="font-bold text-green-600">${gananciaEnvios.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ganancia comisiones</span>
                      <span className="font-bold text-green-600">${gananciaComisiones.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="font-bold text-gray-700">Ganancia total</span>
                      <span className="font-bold text-green-600">${(gananciaEnvios + gananciaComisiones).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Top products */}
                {stats.topProductos.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-gray-700 mb-3">Productos más vendidos</h3>
                    <div className="space-y-2">
                      {stats.topProductos.map((p, i) => (
                        <div key={p.producto} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-100 text-gray-500 w-6 h-6 rounded-full flex items-center justify-center font-bold">
                              {i + 1}
                            </span>
                            <span className="text-sm text-gray-700">{p.producto}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-700">${p.total_vendido.toFixed(0)}</span>
                            <span className="text-xs text-gray-400 ml-1">({p.cantidad_total}u)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={fetchStats}
                  className="w-full mt-4 py-3 border-2 border-brand text-brand-dark rounded-full font-medium active:scale-95 transition-transform"
                >
                  Actualizar datos
                </button>
              </div>
            )}

            {/* ══════════════ TAB: FINANZAS ══════════════ */}
            {tab === "finanzas" && (
              <div className="mt-4">
                {/* Breakdown */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Desglose de ingresos</h3>
                  <div className="space-y-3">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA ENVIOS</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaEnvios.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA COMISIONES</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaComisiones.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA TOTAL</p>
                      <p className="text-2xl font-bold text-green-700">${(gananciaEnvios + gananciaComisiones).toFixed(2)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-600 font-medium">PAGO A TIENDAS (productos)</p>
                      <p className="text-2xl font-bold text-red-700">${pagoTiendas.toFixed(2)}</p>
                    </div>
                    <div className="bg-navy-50 rounded-lg p-3">
                      <p className="text-xs text-navy font-medium">TOTAL COBRADO</p>
                      <p className="text-2xl font-bold text-navy">${t!.ventas_total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Per-store breakdown */}
                {stats.ventasPorTienda.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                    <h3 className="font-bold text-gray-700 mb-3">Pago por tienda</h3>
                    <p className="text-xs text-gray-400 mb-3">Lo que debemos a cada tienda por productos vendidos</p>
                    <div className="space-y-2">
                      {stats.ventasPorTienda.map((tienda) => (
                        <div key={tienda.puesto_id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                          <div>
                            <span className="font-medium text-gray-700">{tienda.puesto_nombre}</span>
                            <span className="text-xs text-gray-400 ml-2">{tienda.pedidos} pedidos</span>
                          </div>
                          <span className="font-bold text-red-600">${tienda.total_vendido.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily sales */}
                {stats.ventasPorDia.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-gray-700 mb-3">Ventas por día</h3>
                    <div className="space-y-1">
                      {stats.ventasPorDia.map((dia) => (
                        <div key={dia.fecha} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <div>
                            <span className="text-sm text-gray-700">
                              {new Date(dia.fecha).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            <span className="text-xs text-gray-400 ml-2">{dia.pedidos} pedidos</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold">${dia.total.toFixed(0)}</span>
                            <span className="text-xs text-green-600 ml-1">(${dia.envios.toFixed(0)} envío)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ TAB: TIENDAS ══════════════ */}
            {tab === "tiendas" && (
              <div className="mt-4">
                {/* Pending approvals */}
                {stats.tiendasPendientes.length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-bold text-red-600 mb-3">
                      Pendientes de aprobacion ({stats.tiendasPendientes.length})
                    </h2>
                    <div className="space-y-3">
                      {stats.tiendasPendientes.map((tienda) => (
                        <div key={tienda.id} className="bg-white rounded-xl p-4 shadow-sm border-2 border-amber-200">
                          <h3 className="font-bold text-gray-800">{tienda.nombre}</h3>
                          <p className="text-sm text-gray-500">{tienda.descripcion || "Sin descripcion"}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Dueno: {tienda.nombre_dueno} — {tienda.telefono_dueno}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => aprobarTienda(tienda.id, true)}
                              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium active:scale-95 transition-transform"
                            >
                              Aprobar
                            </button>
                            <a
                              href={`https://wa.me/52${(tienda.telefono_dueno || "").replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 bg-green-100 text-green-700 py-2 rounded-lg font-medium text-center"
                            >
                              WhatsApp
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Store detail view */}
                {tiendaSeleccionada ? (() => {
                  const tienda = stats.tiendasActivas.find((t) => t.id === tiendaSeleccionada);
                  if (!tienda) return null;
                  const ventas = stats.ventasPorTienda.find((v) => v.puesto_id === tienda.id);
                  return (
                    <div>
                      <button
                        onClick={() => { setTiendaSeleccionada(null); setMensajePuesto(null); setMensajeTexto(""); }}
                        className="flex items-center gap-1 text-sm text-navy font-medium mb-3 active:scale-95 transition-transform"
                      >
                        ← Volver a todas las tiendas
                      </button>

                      <div className="bg-white rounded-xl p-5 shadow-sm">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h2 className="text-xl font-bold text-gray-800">{tienda.nombre}</h2>
                            {tienda.descripcion && (
                              <p className="text-sm text-gray-400 mt-0.5">{tienda.descripcion}</p>
                            )}
                          </div>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            {tienda.total_productos} productos
                          </span>
                        </div>

                        {/* Info */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1.5">
                          {tienda.nombre_dueno && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 w-16">Dueno:</span>
                              <span className="text-gray-700 font-medium">{tienda.nombre_dueno}</span>
                              <span className="text-xs text-gray-300">({tienda.rol_dueno})</span>
                            </div>
                          )}
                          {(tienda.telefono_contacto || tienda.telefono_dueno) && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 w-16">Tel:</span>
                              <span className="text-gray-700">{tienda.telefono_contacto || tienda.telefono_dueno}</span>
                            </div>
                          )}
                          {tienda.ubicacion && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-400 w-16 flex-shrink-0">Dir:</span>
                              <span className="text-gray-700">{tienda.ubicacion}</span>
                            </div>
                          )}
                        </div>

                        {/* Sales */}
                        {ventas && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-navy-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-navy">{ventas.pedidos}</p>
                              <p className="text-[10px] text-gray-400">Pedidos</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-amber-700">${ventas.total_vendido.toFixed(0)}</p>
                              <p className="text-[10px] text-amber-400">Vendido</p>
                            </div>
                          </div>
                        )}

                        {/* Map */}
                        {tienda.lat && tienda.lng && (
                          <MapaPedido
                            lat={tienda.lat}
                            lng={tienda.lng}
                            direccion={tienda.ubicacion || tienda.nombre}
                          />
                        )}

                        {/* Actions */}
                        <div className="space-y-2 mt-3">
                          <div className="flex gap-2">
                            {tienda.usuario_id && (
                              <button
                                onClick={() => resetPin(tienda.usuario_id, tienda.nombre_dueno || tienda.nombre)}
                                className="flex-1 text-sm bg-gray-100 text-gray-700 px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                              >
                                Cambiar PIN
                              </button>
                            )}
                            {(tienda.telefono_contacto || tienda.telefono_dueno) && (
                              <a
                                href={`https://wa.me/52${(tienda.telefono_contacto || tienda.telefono_dueno || "").replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-sm bg-green-100 text-green-700 px-3 py-2.5 rounded-lg font-medium text-center"
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>

                          <button
                            onClick={() => setMensajePuesto(mensajePuesto === tienda.id ? null : tienda.id)}
                            className="w-full text-sm bg-navy-50 text-navy px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                          >
                            Enviar mensaje por la app
                          </button>

                          {/* Inline message form */}
                          {mensajePuesto === tienda.id && (
                            <div className="bg-navy-50 rounded-lg p-3 space-y-2">
                              <textarea
                                value={mensajeTexto}
                                onChange={(e) => setMensajeTexto(e.target.value)}
                                placeholder="Escribe un mensaje para esta tienda..."
                                rows={2}
                                className="w-full border border-navy/20 rounded-lg px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => enviarMensaje(tienda.id)}
                                  disabled={enviandoMensaje || !mensajeTexto.trim()}
                                  className="flex-1 bg-brand text-white py-2 rounded-lg text-sm font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
                                >
                                  {enviandoMensaje ? "Enviando..." : "Enviar"}
                                </button>
                                <button
                                  onClick={() => { setMensajePuesto(null); setMensajeTexto(""); }}
                                  className="px-4 bg-gray-200 text-gray-600 py-2 rounded-lg text-sm active:scale-95 transition-transform"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => {
                              if (confirm(`Desactivar ${tienda.nombre}?`)) {
                                aprobarTienda(tienda.id, false);
                                setTiendaSeleccionada(null);
                              }
                            }}
                            className="w-full text-sm bg-red-50 text-red-500 px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                          >
                            Desactivar tienda
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  /* Store map + list view */
                  <>
                    {/* Store map */}
                    {stats.tiendasActivas.some((t) => t.lat && t.lng) && (
                      <div className="mb-4">
                        <h2 className="font-bold text-gray-700 mb-2">Toca una tienda en el mapa</h2>
                        <MapaTiendasAdmin
                          tiendas={stats.tiendasActivas
                            .filter((t) => t.lat && t.lng)
                            .map((t) => ({
                              id: t.id,
                              nombre: t.nombre,
                              lat: t.lat!,
                              lng: t.lng!,
                              ubicacion: t.ubicacion,
                              telefono: t.telefono_contacto || t.telefono_dueno,
                              productos: t.total_productos,
                            }))}
                          onTiendaClick={(id) => setTiendaSeleccionada(id)}
                          selectedId={tiendaSeleccionada}
                        />
                      </div>
                    )}

                    {/* Active stores list */}
                    <div>
                      <h2 className="font-bold text-gray-700 mb-3">
                        Tiendas activas ({stats.tiendasActivas.length})
                      </h2>
                      {stats.tiendasActivas.length > 0 ? (
                        <div className="space-y-2">
                          {stats.tiendasActivas.map((tienda) => {
                            const ventas = stats.ventasPorTienda.find((v) => v.puesto_id === tienda.id);
                            return (
                              <button
                                key={tienda.id}
                                onClick={() => setTiendaSeleccionada(tienda.id)}
                                className="w-full bg-white rounded-xl p-3 shadow-sm text-left active:scale-[0.98] transition-transform flex items-center gap-3"
                              >
                                <span className="text-2xl">🏪</span>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-gray-800 text-sm">{tienda.nombre}</h3>
                                  <p className="text-xs text-gray-400 truncate">
                                    {tienda.nombre_dueno && `${tienda.nombre_dueno} — `}
                                    {tienda.total_productos} productos
                                    {ventas ? ` — $${ventas.total_vendido.toFixed(0)} vendido` : ""}
                                  </p>
                                </div>
                                <span className="text-gray-300 text-lg">›</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <span className="text-4xl block mb-3">🏪</span>
                          <p className="text-gray-400">No hay tiendas activas</p>
                        </div>
                      )}
                    </div>

                    {/* Share link */}
                    <div className="mt-4 bg-navy-50 rounded-xl p-4 text-center">
                      <p className="text-sm text-navy">
                        Comparte este link para que se registren tiendas:
                      </p>
                      <p className="font-mono text-sm font-bold text-navy mt-1">
                        mercadito.cx/tienda/registro
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══════════════ TAB: REPARTIDORES ══════════════ */}
            {tab === "repartidores" && (
              <div className="mt-4">
                {stats.ventasPorRepartidor.length > 0 ? (
                  <div className="space-y-3">
                    {stats.ventasPorRepartidor.map((r) => (
                      <div key={r.repartidor} className="bg-white rounded-xl p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-700">{r.repartidor}</h3>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            {r.pedidos_entregados} entregas
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-gray-700">${r.total.toFixed(0)}</p>
                            <p className="text-xs text-gray-400">Total manejado</p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-green-700">${r.envios.toFixed(0)}</p>
                            <p className="text-xs text-gray-400">Envíos cobrados</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="text-5xl block mb-4">🛵</span>
                    <p className="text-gray-400">Sin entregas registradas aún</p>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ TAB: ANUNCIOS ══════════════ */}
            {tab === "anuncios" && (
              <div className="mt-4">
                {/* Create announcement */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Nuevo anuncio</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={nuevoAnuncioTitulo}
                      onChange={(e) => setNuevoAnuncioTitulo(e.target.value)}
                      placeholder="Titulo del anuncio"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                    />
                    <textarea
                      value={nuevoAnuncioMensaje}
                      onChange={(e) => setNuevoAnuncioMensaje(e.target.value)}
                      placeholder="Mensaje..."
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      {(["general", "clientes", "tiendas"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNuevoAnuncioTipo(t)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            nuevoAnuncioTipo === t
                              ? "bg-brand text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {t === "general" ? "Todos" : t === "clientes" ? "Solo clientes" : "Solo tiendas"}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={crearAnuncio}
                      disabled={creandoAnuncio || !nuevoAnuncioTitulo || !nuevoAnuncioMensaje}
                      className="w-full bg-brand text-white py-2 rounded-full font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
                    >
                      {creandoAnuncio ? "Publicando..." : "Publicar anuncio"}
                    </button>
                  </div>
                </div>

                {/* Existing announcements */}
                {anuncios.length > 0 ? (
                  <div className="space-y-3">
                    {anuncios.map((a) => (
                      <div key={a.id} className={`bg-white rounded-xl p-4 shadow-sm ${!a.activo ? "opacity-50" : ""}`}>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-gray-800">{a.titulo}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            a.tipo === "general" ? "bg-navy-50 text-navy"
                            : a.tipo === "clientes" ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {a.tipo === "general" ? "Todos" : a.tipo === "clientes" ? "Clientes" : "Tiendas"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{a.mensaje}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {new Date(a.created_at).toLocaleDateString("es-MX")}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleAnuncio(a.id, !a.activo)}
                              className={`text-xs px-3 py-1 rounded-lg ${
                                a.activo
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {a.activo ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              onClick={() => eliminarAnuncio(a.id)}
                              className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-lg"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <span className="text-4xl block mb-3">📢</span>
                    <p className="text-gray-400">No hay anuncios</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
