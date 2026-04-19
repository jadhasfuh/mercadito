"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import LoginRepartidor from "@/components/LoginRepartidor";
import { useSession } from "@/components/SessionProvider";
import type { PedidoConItems } from "@/lib/types";
import EditorPedido from "@/components/EditorPedido";
import NotificationBanner from "@/components/NotificationBanner";
import { notificationsGranted, showNotification, playDoubleBeep } from "@/lib/notifications";

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

const ESTADOS = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", next: "en_compra", nextLabel: "Ir a comprar" },
  en_compra: { label: "Comprando", color: "bg-blue-100 text-blue-800", next: "en_camino", nextLabel: "Salir a entregar" },
  en_camino: { label: "En camino", color: "bg-purple-100 text-purple-800", next: "entregado", nextLabel: "Marcar entregado" },
  entregado: { label: "Entregado", color: "bg-green-100 text-green-800", next: null, nextLabel: null },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800", next: null, nextLabel: null },
};

export default function RepartidorPage() {
  const { usuario, loading: sessionLoading, logout } = useSession();
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

  if (!usuario || usuario.rol !== "repartidor") {
    return <LoginRepartidor />;
  }

  return <RepartidorDashboard userId={usuario.id} userName={usuario.nombre} onLogout={logout} />;
}

type Filtro = "todos" | "mios" | "sin_asignar";

function RepartidorDashboard({ userId, userName, onLogout }: { userId: string; userName: string; onLogout: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const prevPendientesRef = useRef(0);

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

  async function cancelarPedido(pedidoId: string, clienteNombre: string, clienteTel: string) {
    const motivo = prompt(
      `Cancelar pedido de ${clienteNombre}\n\n` +
      `Escribe el motivo:\n` +
      `- Puesto cerrado\n` +
      `- Producto no disponible\n` +
      `- Cliente no contesta\n` +
      `- Cliente pidio cancelar\n` +
      `- Otro motivo`
    );
    if (motivo === null) return;
    if (!motivo) { alert("Escribe un motivo para cancelar"); return; }

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

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Repartidor</h1>
              <p className="text-xs text-white/70 leading-tight">{userName}</p>
            </div>
          </div>
          <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Salir
          </button>
        </div>
      </header>

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
              {/* Active orders grouped by zone */}
              {Object.entries(pedidosPorZona).map(([zona, pedidosZona]) => (
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
                      const estadoInfo = ESTADOS[pedido.estado as keyof typeof ESTADOS];
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

                          {(() => {
                            const dir = parseDireccion(pedido.direccion_entrega);
                            return (
                              <>
                                <p className="text-sm text-gray-500 mb-1">📍 {dir.texto}</p>
                                {dir.lat && dir.lng && (
                                  <MapaPedido lat={dir.lat} lng={dir.lng} direccion={dir.texto} />
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
                                const porTienda: Record<string, { nombre: string; telefono?: string; ubicacion?: string; items: typeof pedido.items }> = {};
                                for (const item of pedido.items) {
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const it = item as any;
                                  if (!porTienda[item.puesto_id]) {
                                    porTienda[item.puesto_id] = {
                                      nombre: item.puesto_nombre || item.puesto_id,
                                      telefono: it.puesto_telefono || undefined,
                                      ubicacion: it.puesto_ubicacion || undefined,
                                      items: [],
                                    };
                                  }
                                  porTienda[item.puesto_id].items.push(item);
                                }
                                return Object.entries(porTienda).map(([pId, tienda]) => (
                                  <div key={pId} className="mb-2 last:mb-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-bold text-amber-700">🏪 {tienda.nombre}</p>
                                      {tienda.telefono && (
                                        <div className="flex gap-1">
                                          <a
                                            href={`https://wa.me/52${tienda.telefono.replace(/\D/g, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"
                                          >
                                            WhatsApp
                                          </a>
                                          <a
                                            href={`tel:${tienda.telefono}`}
                                            className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium"
                                          >
                                            Llamar
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                    {tienda.ubicacion && (
                                      <p className="text-[10px] text-gray-400 mb-0.5">{tienda.ubicacion}</p>
                                    )}
                                    {tienda.items.map((item) => (
                                      <div key={item.id} className="flex justify-between text-sm py-0.5 pl-2">
                                        <span>
                                          {item.cantidad} {item.unidad} {item.producto_nombre}
                                        </span>
                                        <span className="text-gray-600">${item.subtotal.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ));
                              })()}
                              {pedido.editado_por && (
                                <p className="text-xs text-amber-600 mt-1 border-t border-gray-200 pt-1">
                                  Editado por {pedido.editado_por}
                                </p>
                              )}
                            </div>
                          )}

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

              {/* Completed orders */}
              {pedidosCompletados.length > 0 && (
                <div>
                  <h2 className="font-bold text-gray-400 mb-3">Historial</h2>
                  <div className="space-y-2">
                    {pedidosCompletados.slice(0, 10).map((pedido) => {
                      const estadoInfo = ESTADOS[pedido.estado as keyof typeof ESTADOS];
                      return (
                        <div key={pedido.id} className="bg-white rounded-xl p-3 shadow-sm opacity-70">
                          <div className="flex items-center justify-between">
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
                            <span className="font-medium text-gray-600">${pedido.total.toFixed(2)}</span>
                          </div>
                          {pedido.estado === "cancelado" && pedido.motivo_cancelacion && (
                            <p className="text-xs text-red-500 mt-1">Motivo: {pedido.motivo_cancelacion}</p>
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
    </div>
  );
}
