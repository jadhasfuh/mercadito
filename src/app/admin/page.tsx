"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/SessionProvider";

type Tab = "resumen" | "finanzas" | "tiendas" | "repartidores";

interface Stats {
  totales: {
    total_pedidos: number;
    entregados: number;
    cancelados: number;
    activos: number;
    ventas_total: number;
    subtotal_productos: number;
    ingresos_envio: number;
    clientes_unicos: number;
  };
  ventasPorDia: { fecha: string; pedidos: number; total: number; envios: number }[];
  ventasPorTienda: { puesto_id: string; puesto_nombre: string; pedidos: number; total_vendido: number }[];
  ventasPorRepartidor: { repartidor: string; pedidos_entregados: number; total: number; envios: number }[];
  topProductos: { producto: string; cantidad_total: number; total_vendido: number }[];
  tiendasPendientes: { id: string; nombre: string; descripcion: string; nombre_dueno: string; telefono_dueno: string; usuario_id: string }[];
  tiendasActivas: { id: string; nombre: string; descripcion: string; activo: boolean; usuario_id: string; nombre_dueno: string; telefono_dueno: string; rol_dueno: string; total_productos: number }[];
}

export default function AdminPage() {
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

  if (!usuario || usuario.rol !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-3">👑</span>
            <h1 className="text-2xl font-bold text-gray-800">Admin</h1>
            <p className="text-sm text-gray-400 mt-1">Panel de administración</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setLoginLoading(true);
              const result = await login("admin", { telefono, pin });
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl text-center tracking-widest focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
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
              className="w-full bg-indigo-600 text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300"
            >
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AdminDashboard onLogout={logout} />;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("resumen");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    }
    setLoading(false);
  }

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
  // Ganancia = ingresos por envío (lo que cobramos nosotros)
  // Pago a tiendas = subtotal de productos (lo que les debemos)
  const gananciaEnvios = t?.ingresos_envio ?? 0;
  const pagoTiendas = t?.subtotal_productos ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
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
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-xs border-b-2 transition-colors relative min-w-0 ${
              tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-400"
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
                    <p className="text-3xl font-bold text-indigo-600">{t!.entregados}</p>
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
                      <span className="font-bold text-gray-700">Ganancia (envíos)</span>
                      <span className="font-bold text-green-600">${gananciaEnvios.toFixed(2)}</span>
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
                  className="w-full mt-4 py-3 border-2 border-indigo-600 text-indigo-700 rounded-full font-medium active:scale-95 transition-transform"
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
                      <p className="text-xs text-green-600 font-medium">NUESTRA GANANCIA (envíos)</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaEnvios.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-600 font-medium">PAGO A TIENDAS (productos)</p>
                      <p className="text-2xl font-bold text-red-700">${pagoTiendas.toFixed(2)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-3">
                      <p className="text-xs text-indigo-600 font-medium">TOTAL COBRADO</p>
                      <p className="text-2xl font-bold text-indigo-700">${t!.ventas_total.toFixed(2)}</p>
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
                      Pendientes de aprobación ({stats.tiendasPendientes.length})
                    </h2>
                    <div className="space-y-3">
                      {stats.tiendasPendientes.map((tienda) => (
                        <div key={tienda.id} className="bg-white rounded-xl p-4 shadow-sm border-2 border-amber-200">
                          <h3 className="font-bold text-gray-800">{tienda.nombre}</h3>
                          <p className="text-sm text-gray-500">{tienda.descripcion || "Sin descripción"}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Dueño: {tienda.nombre_dueno} — {tienda.telefono_dueno}
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

                {/* Active stores with management */}
                <div>
                  <h2 className="font-bold text-gray-700 mb-3">
                    Tiendas activas ({stats.tiendasActivas.length})
                  </h2>
                  {stats.tiendasActivas.length > 0 ? (
                    <div className="space-y-3">
                      {stats.tiendasActivas.map((tienda) => {
                        const ventas = stats.ventasPorTienda.find((v) => v.puesto_id === tienda.id);
                        return (
                          <div key={tienda.id} className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-bold text-gray-800">{tienda.nombre}</h3>
                                {tienda.descripcion && (
                                  <p className="text-xs text-gray-400">{tienda.descripcion}</p>
                                )}
                              </div>
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                                {tienda.total_productos} productos
                              </span>
                            </div>

                            {/* Owner info */}
                            {tienda.nombre_dueno && (
                              <div className="bg-gray-50 rounded-lg p-2 mb-2 text-sm">
                                <span className="text-gray-600">{tienda.nombre_dueno}</span>
                                <span className="text-gray-400 ml-2">{tienda.telefono_dueno}</span>
                                <span className="text-xs text-gray-300 ml-2">({tienda.rol_dueno})</span>
                              </div>
                            )}

                            {/* Sales */}
                            {ventas && (
                              <div className="flex gap-3 mb-2">
                                <span className="text-xs text-gray-400">{ventas.pedidos} pedidos</span>
                                <span className="text-xs font-bold text-amber-700">${ventas.total_vendido.toFixed(0)} vendido</span>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2">
                              {tienda.usuario_id && (
                                <button
                                  onClick={() => resetPin(tienda.usuario_id, tienda.nombre_dueno || tienda.nombre)}
                                  className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                                >
                                  Cambiar PIN
                                </button>
                              )}
                              {tienda.telefono_dueno && (
                                <a
                                  href={`https://wa.me/52${tienda.telefono_dueno.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg"
                                >
                                  WhatsApp
                                </a>
                              )}
                              <button
                                onClick={() => aprobarTienda(tienda.id, false)}
                                className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                              >
                                Desactivar
                              </button>
                            </div>
                          </div>
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
                <div className="mt-4 bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-indigo-700">
                    Comparte este link para que se registren tiendas:
                  </p>
                  <p className="font-mono text-sm font-bold text-indigo-800 mt-1">
                    mercadito.cx/tienda/registro
                  </p>
                </div>
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
          </>
        )}
      </main>
    </div>
  );
}
