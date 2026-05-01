"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "@/components/SessionProvider";
import type { PedidoConItems } from "@/lib/types";
import EditorPedido from "@/components/EditorPedido";
import PedidoDesglose from "@/components/PedidoDesglose";
import NotificationBanner from "@/components/NotificationBanner";
import { notificationsGranted, showNotification, playDoubleBeep } from "@/lib/notifications";
import { labelEstado, siguienteAccionLabel, type EstadoPedido, type TipoPedido } from "@/lib/estadoPedido";

const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

/** Parse "Calle, Colonia, Ciudad #42 [20.123, -102.456]" → { texto, lat, lng } */
function parseDireccion(raw: string): { texto: string; lat: number | null; lng: number | null } {
  const match = raw.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
  if (match) {
    return {
      texto: raw.replace(match[0], "").trim(),
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
    };
  }
  return { texto: raw, lat: null, lng: null };
}

const ESTADO_COLORS: Record<EstadoPedido, { color: string; next: EstadoPedido | null }> = {
  pendiente: { color: "bg-yellow-100 text-yellow-800", next: "en_compra" },
  en_compra: { color: "bg-blue-100 text-blue-800", next: "en_camino" },
  en_camino: { color: "bg-purple-100 text-purple-800", next: "entregado" },
  entregado: { color: "bg-green-100 text-green-800", next: null },
  cancelado: { color: "bg-red-100 text-red-800", next: null },
};

function infoEstado(estado: EstadoPedido, tipo?: TipoPedido | null) {
  const c = ESTADO_COLORS[estado];
  return {
    label: labelEstado(estado, tipo),
    color: c.color,
    next: c.next,
    nextLabel: c.next ? siguienteAccionLabel(estado, tipo) : null,
  };
}

export default function RepartidorPage() {
  const { usuario, loading: sessionLoading, logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!usuario || usuario.rol !== "repartidor") router.replace("/repartidor/login");
  }, [usuario, sessionLoading, router]);

  if (sessionLoading || !usuario || usuario.rol !== "repartidor") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-gray-400">{sessionLoading ? "Cargando..." : "Redirigiendo..."}</p>
      </div>
    );
  }

  return <RepartidorDashboard userId={usuario.id} userName={usuario.nombre} onLogout={logout} />;
}

type Filtro = "todos" | "mios" | "sin_asignar" | "historial";

function RepartidorDashboard({ userId, userName, onLogout }: { userId: string; userName: string; onLogout: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ pedidoId: string; clienteNombre: string; clienteTel: string } | null>(null);
  const [historialExpandido, setHistorialExpandido] = useState<string | null>(null);
  const prevPendientesRef = useRef(0);
  // Ubicación del repartidor para que las rutas (Google Maps + polilínea
  // del card) arranquen donde realmente está. Se mantiene viva con
  // watchPosition: si activa el botón, la app empieza a tirar pings al
  // back para que el cliente vea su trayecto en tiempo casi-real.
  const [ubicacionRep, setUbicacionRep] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [obteniendoUbi, setObteniendoUbi] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  function activarUbicacion() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("Tu dispositivo no soporta ubicación");
      return;
    }
    setObteniendoUbi(true);
    // Primer fix rápido para mostrar algo de inmediato.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacionRep({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
        setObteniendoUbi(false);
      },
      (err) => {
        alert("No pudimos obtener tu ubicación: " + err.message);
        setObteniendoUbi(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    // Y luego suscripción continua mientras la pantalla esté abierta.
    if (watchIdRef.current == null) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setUbicacionRep({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
          },
          () => { /* errores transitorios — ignoramos, nos quedamos con el último fix */ },
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 }
        );
      } catch {
        // algunos navegadores antiguos no soportan watchPosition
      }
    }
  }

  function detenerUbicacion() {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setUbicacionRep(null);
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Postear cada nueva ubicación al backend para que el cliente la vea en
  // su pestaña Pedidos. Throttle implícito: watchPosition de iOS/Android
  // emite ~cada vez que el chip GPS lo actualiza (5-30s típico).
  useEffect(() => {
    if (!ubicacionRep) return;
    fetch("/api/repartidor/ubicacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: ubicacionRep.lat, lng: ubicacionRep.lng }),
    }).catch(() => {});
  }, [ubicacionRep]);

  const fetchPedidos = useCallback(async () => {
    const res = await fetch("/api/pedidos");
    if (!res.ok) return;
    const data = await res.json();

    // Check for new pendiente orders
    const nuevosPendientes = data.filter((p: PedidoConItems) => p.estado === "pendiente").length;
    if (prevPendientesRef.current > 0 || pedidos.length > 0) {
      if (nuevosPendientes > prevPendientesRef.current) {
        const nuevos = nuevosPendientes - prevPendientesRef.current;
        playDoubleBeep();
        showNotification(
          "Mercadito - Nuevo pedido",
          `${nuevos} pedido${nuevos > 1 ? "s" : ""} nuevo${nuevos > 1 ? "s" : ""}`,
          "/repartidor"
        );
      }
    }
    prevPendientesRef.current = nuevosPendientes;
    setPedidos(data);
  }, [pedidos.length]);

  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 15000); // Check every 15s
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cambiarEstado(pedidoId: string, nuevoEstado: string) {
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (res.ok) fetchPedidos();
  }

  async function tomarPedido(pedidoId: string) {
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repartidor_id: userId }),
    });
    if (res.ok) fetchPedidos();
  }

  async function soltarPedido(pedidoId: string) {
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repartidor_id: null }),
    });
    if (res.ok) fetchPedidos();
  }

  // Abre el modal custom de cancelación. La llamada real se hace desde el modal
  // después de elegir motivo — evita prompt() nativo que se ve feo en mobile.
  function cancelarPedido(pedidoId: string, clienteNombre: string, clienteTel: string) {
    setCancelModal({ pedidoId, clienteNombre, clienteTel });
  }

  async function ejecutarCancelacion(motivo: string) {
    if (!cancelModal) return;
    const { pedidoId, clienteNombre, clienteTel } = cancelModal;
    setCancelModal(null);
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "cancelado", motivo_cancelacion: motivo }),
    });
    if (res.ok) {
      alert(
        `Pedido cancelado.\n\n` +
        `IMPORTANTE: Llama al cliente para avisarle.\n` +
        `${clienteNombre}: ${clienteTel}`
      );
      fetchPedidos();
    } else {
      const data = await res.json();
      alert(data.error || "No se pudo cancelar");
    }
  }

  const pedidosActivos = useMemo(() => {
    let activos = pedidos.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado");
    if (filtro === "mios") activos = activos.filter((p) => p.repartidor_id === userId);
    if (filtro === "sin_asignar") activos = activos.filter((p) => !p.repartidor_id);
    return activos;
  }, [pedidos, filtro, userId]);

  const pedidosCompletados = pedidos.filter((p) => p.estado === "entregado" || p.estado === "cancelado");

  // Group active orders by zone
  const pedidosPorZona = useMemo(() => {
    const grupos: Record<string, PedidoConItems[]> = {};
    for (const p of pedidosActivos) {
      const zona = p.zona_nombre || "Sin zona";
      if (!grupos[zona]) grupos[zona] = [];
      grupos[zona].push(p);
    }
    // Sort each group by created_at ASC (first come first serve)
    for (const zona of Object.keys(grupos)) {
      grupos[zona].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return grupos;
  }, [pedidosActivos]);

  const misPedidosCount = pedidos.filter((p) => p.repartidor_id === userId && p.estado !== "entregado" && p.estado !== "cancelado").length;
  const sinAsignarCount = pedidos.filter((p) => !p.repartidor_id && p.estado !== "entregado" && p.estado !== "cancelado").length;

  // Promedio de calificación del repartidor a partir de sus pedidos
  // entregados con rating. Sirve para el chip resumen en el header.
  const misRatings = useMemo(() => {
    const calificados = pedidos.filter(
      (p) => p.repartidor_id === userId && p.estado === "entregado" && p.repartidor_rating != null
    );
    if (calificados.length === 0) return null;
    const total = calificados.reduce((s, p) => s + (Number(p.repartidor_rating) || 0), 0);
    return { promedio: total / calificados.length, cuenta: calificados.length };
  }, [pedidos, userId]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">Repartidor</h1>
              <p className="text-xs text-white/70 leading-tight truncate">{userName}</p>
            </div>
            {misRatings && (
              <span
                className="ml-1 bg-yellow-300 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                title={`${misRatings.cuenta} calificación${misRatings.cuenta === 1 ? "" : "es"}`}
              >
                ⭐ {misRatings.promedio.toFixed(1)} · {misRatings.cuenta}
              </span>
            )}
          </div>
          <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Salir
          </button>
        </div>
      </header>

      {/* Toggle de ubicación. Cuando está activo: rutas arrancan donde
          estás, las tiendas se reordenan por cercanía y el cliente puede
          ver tu progreso en su pestaña Pedidos. */}
      <div className="max-w-lg mx-auto px-4 py-2 bg-white border-b">
        {ubicacionRep ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-gray-600">
              📍 Compartiendo ubicación · <span className="text-gray-400">actualizada hace {Math.max(0, Math.round((Date.now() - ubicacionRep.ts) / 60000))} min</span>
            </p>
            <button
              onClick={detenerUbicacion}
              className="text-[11px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-medium"
            >
              Apagar
            </button>
          </div>
        ) : (
          <button
            onClick={activarUbicacion}
            disabled={obteniendoUbi}
            className="w-full text-xs bg-brand-light text-brand-dark px-3 py-2 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-60"
          >
            {obteniendoUbi ? "Obteniendo ubicación…" : "📍 Activar ubicación · mejora rutas y deja que el cliente te vea"}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="max-w-lg mx-auto flex gap-1 bg-white border-b sticky top-14 z-30 px-4 py-2">
        <button
          onClick={() => setFiltro("todos")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === "todos" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Todos ({pedidosActivos.length})
        </button>
        <button
          onClick={() => setFiltro("mios")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === "mios" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Mis pedidos ({misPedidosCount})
        </button>
        <button
          onClick={() => setFiltro("sin_asignar")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === "sin_asignar" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Sin asignar ({sinAsignarCount})
        </button>
        <button
          onClick={() => setFiltro("historial")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === "historial" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Historial ({pedidosCompletados.length})
        </button>
      </div>

      <main className="max-w-lg mx-auto px-4 pb-8">
        <div className="mt-3 mb-2">
          <NotificationBanner mensaje="Activa las notificaciones para recibir alertas de pedidos nuevos, incluso con la pantalla apagada" />
        </div>
        <div className="mt-4">
          {loading && pedidos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Cargando pedidos...</div>
          ) : pedidosActivos.length === 0 && pedidosCompletados.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-5xl block mb-4">📭</span>
              <p className="text-gray-400">No hay pedidos</p>
            </div>
          ) : (
            <>
              {/* Active orders grouped by zone — ocultos en modo historial */}
              {filtro !== "historial" && Object.entries(pedidosPorZona).map(([zona, pedidosZona]) => (
                <div key={zona} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📍</span>
                    <h2 className="font-bold text-gray-700">{zona}</h2>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                      {pedidosZona.length} pedido{pedidosZona.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {pedidosZona.map((pedido, idx) => {
                      const estadoInfo = infoEstado(pedido.estado as EstadoPedido, pedido.tipo);
                      const esMio = pedido.repartidor_id === userId;
                      const asignadoAOtro = pedido.repartidor_id && !esMio;

                      return (
                        <div
                          key={pedido.id}
                          className={`bg-white rounded-xl p-4 shadow-sm ${asignadoAOtro ? "opacity-50" : ""} ${esMio ? "ring-2 ring-brand" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-lg">{pedido.cliente_nombre}</span>
                              <span className={`text-xs px-2 py-1 rounded-full ${estadoInfo.color}`}>
                                {estadoInfo.label}
                              </span>
                            </div>
                            <span className="font-bold text-brand-dark">${pedido.total.toFixed(2)}</span>
                          </div>

                          {/* Assignment */}
                          {pedido.repartidor_nombre && (
                            <p className="text-xs mb-1">
                              <span className={`px-2 py-0.5 rounded-full ${esMio ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-500"}`}>
                                {esMio ? "Asignado a ti" : `Asignado a ${pedido.repartidor_nombre}`}
                              </span>
                            </p>
                          )}

                          {/* Pedido agendado: el repartidor lo ve antes para
                              prepararse, pero sabe que no se compra ya. */}
                          {pedido.agendado_para && (
                            <p className="text-xs mb-1">
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                                📅 Agendado para {new Date(pedido.agendado_para).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                              </span>
                            </p>
                          )}

                          {(() => {
                            const dir = parseDireccion(pedido.direccion_entrega);
                            // Tiendas únicas del pedido en el orden en que
                            // aparecen los items. Filtramos las que no tienen
                            // coords para no romper el mapa.
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
                            return (
                              <>
                                <p className="text-sm text-gray-500 mb-1 break-words">📍 {dir.texto}</p>
                                {dir.lat && dir.lng && (
                                  <MapaPedido
                                    lat={dir.lat}
                                    lng={dir.lng}
                                    direccion={dir.texto}
                                    paradas={paradas}
                                    origen={ubicacionRep ? { lat: ubicacionRep.lat, lng: ubicacionRep.lng } : null}
                                  />
                                )}
                              </>
                            );
                          })()}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-gray-500">📱 {pedido.cliente_telefono}</span>
                            <a
                              href={`https://wa.me/52${pedido.cliente_telefono.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"
                            >
                              WhatsApp
                            </a>
                            <a
                              href={`tel:${pedido.cliente_telefono}`}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium"
                            >
                              Llamar
                            </a>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm text-gray-400">Envio ${pedido.costo_envio}</span>
                            {pedido.metodo_pago === "tarjeta" ? (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                💳 TARJETA — Llevar terminal
                              </span>
                            ) : (
                              <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                                💵 Efectivo
                              </span>
                            )}
                          </div>

                          {pedido.notas && (
                            <p className="text-sm bg-yellow-50 p-2 rounded mb-2">📝 {pedido.notas}</p>
                          )}

                          {/* Items — editor or read-only */}
                          {editandoPedido === pedido.id ? (
                            <div className="mb-3">
                              <EditorPedido
                                pedidoId={pedido.id}
                                items={pedido.items}
                                editadoPor={`repartidor ${userName}`}
                                onSaved={() => {
                                  setEditandoPedido(null);
                                  alert("Pedido editado. LLAMA AL CLIENTE para avisarle del cambio.");
                                  fetchPedidos();
                                }}
                                onCancel={() => setEditandoPedido(null)}
                              />
                            </div>
                          ) : pedido.tipo === "envio" ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                              <p className="text-[11px] uppercase tracking-wider text-amber-800 font-bold mb-2">📦 ENVÍO DE PAQUETE</p>
                              <div className="space-y-1.5 text-sm">
                                <p><span className="text-gray-500">Peso:</span> <span className="font-medium">{pedido.peso_kg != null ? Number(pedido.peso_kg).toFixed(1) : "?"} kg</span></p>
                                <p><span className="text-gray-500">Contenido:</span> <span className="font-medium">{pedido.descripcion_contenido || "—"}</span></p>
                                <div className="border-t border-amber-200 pt-2 mt-2">
                                  <p className="text-[11px] font-bold text-amber-700 mb-1">🏠 RECOGER EN</p>
                                  <p>{pedido.recogida_nombre} <span className="text-gray-400">·</span> <a href={`tel:${pedido.recogida_telefono}`} className="text-blue-600 underline">{pedido.recogida_telefono}</a></p>
                                  <p className="text-xs text-gray-700 mt-0.5">{pedido.direccion_recogida?.split("[")[0].trim()}</p>
                                  {pedido.recogida_lat != null && pedido.recogida_lng != null && (
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&destination=${pedido.recogida_lat},${pedido.recogida_lng}&travelmode=driving${ubicacionRep ? `&origin=${ubicacionRep.lat},${ubicacionRep.lng}` : ""}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-block mt-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium"
                                    >
                                      📍 Mapa a recogida
                                    </a>
                                  )}
                                </div>
                                <div className="border-t border-amber-200 pt-2 mt-2">
                                  <p className="text-[11px] font-bold text-amber-700 mb-1">🎯 ENTREGAR A</p>
                                  <p>{pedido.cliente_nombre} <span className="text-gray-400">·</span> <a href={`tel:${pedido.cliente_telefono}`} className="text-blue-600 underline">{pedido.cliente_telefono}</a></p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <div className="flex justify-between items-center mb-1">
                                <p className="text-xs font-bold text-gray-500">LISTA DE COMPRAS:</p>
                                {(esMio || !pedido.repartidor_id) && (pedido.estado === "pendiente" || pedido.estado === "en_compra") && (
                                  <button
                                    onClick={() => setEditandoPedido(pedido.id)}
                                    className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                                  >
                                    Editar lista
                                  </button>
                                )}
                              </div>
                              {/* Group items by store */}
                              {(() => {
                                type TiendaInfo = {
                                  nombre: string;
                                  telefono?: string;
                                  ubicacion?: string;
                                  lat?: number | null;
                                  lng?: number | null;
                                  items: typeof pedido.items;
                                  orden: number;
                                };
                                const porTienda: Record<string, TiendaInfo> = {};
                                let orden = 0;
                                for (const item of pedido.items) {
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const it = item as any;
                                  if (!porTienda[item.puesto_id]) {
                                    porTienda[item.puesto_id] = {
                                      nombre: item.puesto_nombre || item.puesto_id,
                                      telefono: it.puesto_telefono || undefined,
                                      ubicacion: it.puesto_ubicacion || undefined,
                                      lat: it.puesto_lat != null ? Number(it.puesto_lat) : null,
                                      lng: it.puesto_lng != null ? Number(it.puesto_lng) : null,
                                      items: [],
                                      orden: ++orden,
                                    };
                                  }
                                  porTienda[item.puesto_id].items.push(item);
                                }
                                return Object.entries(porTienda).map(([pId, tienda]) => {
                                  const tieneCoords = tienda.lat != null && tienda.lng != null && !Number.isNaN(tienda.lat) && !Number.isNaN(tienda.lng);
                                  // Buscar mapa: si hay coords usamos ?q=lat,lng;
                                  // si no, usamos el texto de ubicación. Cuando
                                  // ninguno está, omitimos el botón.
                                  const mapsHref = tieneCoords
                                    ? `https://www.google.com/maps/dir/?api=1&destination=${tienda.lat},${tienda.lng}&travelmode=driving${ubicacionRep ? `&origin=${ubicacionRep.lat},${ubicacionRep.lng}` : ""}`
                                    : tienda.ubicacion
                                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tienda.ubicacion)}`
                                      : null;
                                  return (
                                    <div key={pId} className="mb-2 last:mb-0">
                                      <div className="flex items-start gap-2 flex-wrap">
                                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1 min-w-0 flex-shrink break-words">
                                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-[10px] flex-shrink-0">{tienda.orden}</span>
                                          <span className="break-words">🏪 {tienda.nombre}</span>
                                        </p>
                                        <div className="flex gap-1 flex-wrap">
                                          {mapsHref && (
                                            <a
                                              href={mapsHref}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                                            >
                                              📍 Mapa
                                            </a>
                                          )}
                                          {tienda.telefono && (
                                            <>
                                              <a
                                                href={`https://wa.me/52${tienda.telefono.replace(/\D/g, "")}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                                              >
                                                WhatsApp
                                              </a>
                                              <a
                                                href={`tel:${tienda.telefono}`}
                                                className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                                              >
                                                Llamar
                                              </a>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      {tienda.ubicacion && (
                                        <p className="text-[10px] text-gray-400 mb-0.5 break-words">{tienda.ubicacion}</p>
                                      )}
                                      {tienda.items.map((item) => (
                                        <div key={item.id} className="py-0.5 pl-2">
                                          <div className="flex justify-between gap-2 text-sm">
                                            <span className="min-w-0 break-words">
                                              {item.cantidad} {item.unidad} {item.producto_nombre}
                                            </span>
                                            <span className="text-gray-600 whitespace-nowrap">${item.subtotal.toFixed(2)}</span>
                                          </div>
                                          {(item.variante_nombre || (item.modificadores && item.modificadores.length > 0)) && (
                                            <p className="text-[11px] text-brand-dark pl-3 leading-tight break-words">
                                              {[item.variante_nombre, ...(item.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ")}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                });
                              })()}
                              {pedido.editado_por && (
                                <p className="text-xs text-amber-600 mt-1 border-t border-gray-200 pt-1">
                                  Editado por {pedido.editado_por}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Desglose (productos/servicio/envío/total/método) */}
                          <div className="mb-3">
                            <PedidoDesglose pedido={pedido} compact />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            {/* Assign / unassign */}
                            {!pedido.repartidor_id && (
                              <button
                                onClick={() => tomarPedido(pedido.id)}
                                className="px-4 bg-green-100 text-green-700 py-2 rounded-lg font-medium text-sm active:scale-95 transition-transform"
                              >
                                Tomar pedido
                              </button>
                            )}
                            {esMio && pedido.estado === "pendiente" && (
                              <button
                                onClick={() => soltarPedido(pedido.id)}
                                className="px-3 bg-gray-100 text-gray-500 py-2 rounded-lg text-sm"
                              >
                                Soltar
                              </button>
                            )}

                            {/* State transitions (only if assigned to me or unassigned) */}
                            {(esMio || !pedido.repartidor_id) && estadoInfo.next && (
                              <button
                                onClick={() => {
                                  if (!pedido.repartidor_id) {
                                    // Auto-assign when advancing state
                                    tomarPedido(pedido.id).then(() =>
                                      cambiarEstado(pedido.id, estadoInfo.next!)
                                    );
                                  } else {
                                    cambiarEstado(pedido.id, estadoInfo.next!);
                                  }
                                }}
                                className="flex-1 bg-brand text-white py-2 rounded-lg font-medium active:scale-95 transition-transform"
                              >
                                {estadoInfo.nextLabel}
                              </button>
                            )}

                            {(esMio || !pedido.repartidor_id) && (pedido.estado === "pendiente" || pedido.estado === "en_compra") && (
                              <button
                                onClick={() => cancelarPedido(pedido.id, pedido.cliente_nombre, pedido.cliente_telefono)}
                                className="px-4 bg-red-100 text-red-600 py-2 rounded-lg font-medium"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-gray-300 mt-2">
                            {new Date(pedido.created_at).toLocaleString("es-MX")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Completed orders: siempre si filtro=historial (sin tope), o los últimos 10 abajo si es otro filtro */}
              {filtro === "historial" && pedidosCompletados.length === 0 && (
                <div className="text-center py-12">
                  <span className="text-5xl block mb-4">📭</span>
                  <p className="text-gray-400">No hay pedidos en el historial</p>
                </div>
              )}
              {pedidosCompletados.length > 0 && (
                <div>
                  {filtro !== "historial" && (
                    <h2 className="font-bold text-gray-400 mb-3">Historial</h2>
                  )}
                  <div className="space-y-2">
                    {(filtro === "historial" ? pedidosCompletados : pedidosCompletados.slice(0, 10)).map((pedido) => {
                      const estadoInfo = infoEstado(pedido.estado as EstadoPedido, pedido.tipo);
                      const abierto = historialExpandido === pedido.id;
                      return (
                        <div key={pedido.id} className="bg-white rounded-xl p-3 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setHistorialExpandido(abierto ? null : pedido.id)}
                            className="w-full flex items-center justify-between text-left"
                          >
                            <div>
                              <span className="font-medium">{pedido.cliente_nombre}</span>
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${estadoInfo.color}`}>
                                {estadoInfo.label}
                              </span>
                              {pedido.repartidor_nombre && (
                                <span className="ml-1 text-xs text-gray-400">
                                  — {pedido.repartidor_nombre}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-600">${pedido.total.toFixed(2)}</span>
                              <span className="text-gray-400 text-xs">{abierto ? "▲" : "▼"}</span>
                            </div>
                          </button>
                          {pedido.estado === "cancelado" && pedido.motivo_cancelacion && (
                            <p className="text-xs text-red-500 mt-1">Motivo: {pedido.motivo_cancelacion}</p>
                          )}
                          {abierto && (
                            <div className="mt-3 space-y-2">
                              {pedido.tipo === "envio" ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs space-y-1">
                                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">📦 Envío de paquete</p>
                                  {pedido.peso_kg != null && <p><span className="text-gray-500">Peso:</span> {Number(pedido.peso_kg).toFixed(1)} kg</p>}
                                  {pedido.descripcion_contenido && <p><span className="text-gray-500">Contenido:</span> {pedido.descripcion_contenido}</p>}
                                  {pedido.recogida_nombre && <p><span className="text-gray-500">Envía:</span> {pedido.recogida_nombre} {pedido.recogida_telefono && <a href={`tel:${pedido.recogida_telefono}`} className="text-blue-600 underline ml-1">{pedido.recogida_telefono}</a>}</p>}
                                  {pedido.direccion_recogida && <p><span className="text-gray-500">Recoger en:</span> {pedido.direccion_recogida.split("[")[0].trim()}</p>}
                                </div>
                              ) : (
                                <div className="bg-gray-50 rounded-lg p-2 text-xs space-y-0.5">
                                  {pedido.items.map((it) => (
                                    <div key={it.id} className="flex justify-between">
                                      <span className="text-gray-700">{it.cantidad} {it.unidad ?? ""} {it.producto_nombre}</span>
                                      <span className="text-gray-500">${Number(it.subtotal).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <PedidoDesglose pedido={pedido} compact />

                              {/* Calificación del cliente — solo en pedidos
                                  asignados a este repartidor. Read-only. */}
                              {pedido.repartidor_id === userId && (pedido.repartidor_rating != null || pedido.repartidor_review) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mb-1">
                                    Calificación del cliente
                                  </p>
                                  {pedido.repartidor_rating != null && (
                                    <div className="flex items-center gap-0.5 mb-1">
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <span
                                          key={n}
                                          className="text-base leading-none"
                                          style={{ opacity: n <= (pedido.repartidor_rating ?? 0) ? 1 : 0.25, filter: n <= (pedido.repartidor_rating ?? 0) ? "none" : "grayscale(1)" }}
                                        >
                                          ⭐
                                        </span>
                                      ))}
                                      <span className="ml-1 text-xs font-bold text-amber-700">{pedido.repartidor_rating}/5</span>
                                    </div>
                                  )}
                                  {pedido.repartidor_review && (
                                    <p className="text-xs text-gray-700 italic break-words">&ldquo;{pedido.repartidor_review}&rdquo;</p>
                                  )}
                                </div>
                              )}

                              <p className="text-[10px] text-gray-400">
                                #{pedido.id.slice(0, 8).toUpperCase()} · {new Date(pedido.created_at).toLocaleString("es-MX")}
                              </p>
                            </div>
                          )}
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
      </main>

      {/* Modal: elegir motivo de cancelación */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-8">
            <h3 className="text-lg font-bold text-gray-800 mb-1">¿Por qué se cancela?</h3>
            <p className="text-xs text-gray-500 mb-4">
              Cancelando pedido de <span className="font-semibold">{cancelModal.clienteNombre}</span>. Esto queda registrado.
            </p>
            <div className="space-y-2">
              {[
                "Puesto cerrado",
                "Producto no disponible",
                "Cliente no contesta",
                "Cliente pidió cancelar",
                "Dirección incorrecta",
                "Otro motivo",
              ].map((motivo) => (
                <button
                  key={motivo}
                  type="button"
                  onClick={() => ejecutarCancelacion(motivo)}
                  className="w-full flex items-center justify-between bg-gray-50 hover:bg-brand-light active:scale-[0.99] transition-all rounded-lg px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium text-gray-700">{motivo}</span>
                  <span className="text-gray-400">›</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCancelModal(null)}
              className="w-full mt-4 py-2.5 text-gray-500 text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
