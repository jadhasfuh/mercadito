"use client";
import { useCallback, useEffect, useState } from "react";
import InputBuscar from "@/components/InputBuscar";
import { fechaHoraMX } from "@/lib/fecha";
import { esPinFuerte, esPinValido, PIN_MENSAJE, PIN_DEBIL_MENSAJE } from "@/lib/validators";
import { confirmar, avisar, preguntar } from "@/components/Dialogos";

interface UsuarioRow {
  id: string;
  nombre: string;
  telefono: string;
  rol: "cliente" | "repartidor" | "tienda" | "admin";
  activo: boolean;
  puesto_id: string | null;
  puesto_nombre: string | null;
  tiene_pin: boolean;
  created_at: string | null;
  pedidos_count: string | number;
}

const ROL_BADGE: Record<string, { label: string; cls: string }> = {
  cliente: { label: "Cliente", cls: "bg-blue-100 text-blue-700" },
  tienda: { label: "Tienda", cls: "bg-amber-100 text-amber-700" },
  repartidor: { label: "Repartidor", cls: "bg-purple-100 text-purple-700" },
  admin: { label: "Admin", cls: "bg-red-100 text-red-700" },
};

export default function PanelUsuarios() {
  const [q, setQ] = useState("");
  const [rolFiltro, setRolFiltro] = useState<string>("");
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (rolFiltro) params.set("rol", rolFiltro);
    const res = await fetch(`/api/admin/usuarios?${params.toString()}`);
    if (res.ok) setUsuarios(await res.json());
    setLoading(false);
  }, [q, rolFiltro]);

  useEffect(() => { load(); }, [load]);

  async function borrarPin(u: UsuarioRow) {
    if (!(await confirmar({
      emoji: "🔑",
      titulo: `¿Borrar el PIN de ${u.nombre}?`,
      mensaje: "Va a poder entrar solo con su teléfono y ponerse uno nuevo.",
      ok: "Sí, borrarlo",
      peligro: true,
    }))) return;
    setBusy(u.id);
    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: u.id, borrar: true }),
      });
      if (!res.ok) avisar({ emoji: "😕", titulo: (await res.json()).error || "No se pudo guardar." });
      else load();
    } finally {
      setBusy(null);
    }
  }

  async function setPinNuevo(u: UsuarioRow) {
    const pin = await preguntar({
      emoji: "🔑",
      titulo: `Nuevo PIN para ${u.nombre}`,
      mensaje: "Son 6 dígitos, solo números. Evita los obvios (123456, 111111…): el sistema los rechaza.",
      tipo: "pin",
      placeholder: "······",
      ok: "Guardar PIN",
    });
    if (pin === null) return;
    // Las dos reglas se validan aquí además de en el servidor: así el motivo
    // del rechazo se ve al instante y no como un error genérico de vuelta.
    if (!esPinValido(pin)) { avisar({ emoji: "🔢", titulo: PIN_MENSAJE, mensaje: "Solo números, sin letras." }); return; }
    if (!esPinFuerte(pin)) { avisar({ emoji: "🔓", titulo: "Ese PIN es muy fácil de adivinar", mensaje: PIN_DEBIL_MENSAJE }); return; }
    setBusy(u.id);
    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: u.id, nuevo_pin: pin }),
      });
      if (!res.ok) avisar({ emoji: "😕", titulo: (await res.json()).error || "No se pudo guardar." });
      else load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-bold text-gray-700">Usuarios registrados</h3>
        <div className="flex gap-2 flex-wrap">
          <InputBuscar
            value={q}
            onChange={setQ}
            placeholder="Buscar por nombre o teléfono"
            className="flex-1 min-w-[200px]"
          />
          <select
            value={rolFiltro}
            onChange={(e) => setRolFiltro(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Todos los roles</option>
            <option value="cliente">Clientes</option>
            <option value="tienda">Tiendas</option>
            <option value="repartidor">Repartidores</option>
            <option value="admin">Admins</option>
          </select>
          <button
            onClick={load}
            className="bg-brand-light text-brand-dark px-4 py-2 rounded-lg text-sm font-bold"
          >
            🔍
          </button>
        </div>
        <p className="text-xs text-gray-400">{loading ? "Cargando…" : `${usuarios.length} usuario${usuarios.length === 1 ? "" : "s"}`}</p>
      </div>

      {!loading && usuarios.length === 0 && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <span className="text-4xl block mb-3">👥</span>
          <p className="text-gray-400">No se encontraron usuarios</p>
        </div>
      )}

      {usuarios.map((u) => {
        const badge = ROL_BADGE[u.rol] ?? { label: u.rol, cls: "bg-gray-100 text-gray-700" };
        return (
          <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 truncate">{u.nombre || "—"}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {!u.activo && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-gray-200 text-gray-600">
                      Inactivo
                    </span>
                  )}
                  {u.tiene_pin ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-green-100 text-green-700">
                      🔒 PIN
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-gray-100 text-gray-500">
                      Sin PIN
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">📱 {u.telefono}</p>
                {u.puesto_nombre && (
                  <p className="text-xs text-gray-400 mt-0.5">🏪 {u.puesto_nombre}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {Number(u.pedidos_count)} pedido{Number(u.pedidos_count) === 1 ? "" : "s"}
                  {u.created_at ? ` · Registro ${fechaHoraMX(u.created_at, { dateStyle: "short" })}` : ""}
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-1.5">
                {u.tiene_pin && (
                  <button
                    onClick={() => borrarPin(u)}
                    disabled={busy === u.id}
                    className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-full font-medium border border-red-200 disabled:opacity-50"
                  >
                    Borrar PIN
                  </button>
                )}
                {u.rol !== "cliente" && (
                  <button
                    onClick={() => setPinNuevo(u)}
                    disabled={busy === u.id}
                    className="text-xs bg-brand-light text-brand-dark px-3 py-1.5 rounded-full font-bold disabled:opacity-50"
                  >
                    {u.tiene_pin ? "Cambiar PIN" : "Asignar PIN"}
                  </button>
                )}
                {u.rol === "cliente" && !u.tiene_pin && (
                  <span className="text-[10px] text-gray-400 text-center">El cliente lo crea desde su app</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
