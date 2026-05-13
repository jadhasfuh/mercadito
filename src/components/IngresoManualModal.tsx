"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

interface TiendaOpcion {
  id: string;
  nombre: string;
}

interface Props {
  abierto: boolean;
  onClose: () => void;
  onGuardado: () => void;
}

/**
 * Modal para que el repartidor registre una venta manual (pedidos por
 * WhatsApp con cobro mental, mandados directos del cliente). El monto que
 * captura es la GANANCIA DE MERCADITO (envío + servicio + propina), NO el
 * ticket completo del cliente — esto se imprime en el helper para que el
 * repartidor no se confunda.
 */
export default function IngresoManualModal({ abierto, onClose, onGuardado }: Props) {
  const [tipo, setTipo] = useState<"tienda" | "mandado">("tienda");
  const [puestoId, setPuestoId] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");
  const [detalle, setDetalle] = useState("");
  const [tiendas, setTiendas] = useState<TiendaOpcion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar lista de tiendas (cache local — se re-piden cada vez que abre,
  // es barato y mantiene el listado fresco si admin aprueba una nueva).
  useEffect(() => {
    if (!abierto) return;
    fetch("/api/tiendas")
      .then((r) => r.json())
      .then((data: TiendaOpcion[]) => {
        if (Array.isArray(data)) setTiendas(data);
      })
      .catch(() => {});
  }, [abierto]);

  // Reset al cerrar
  useEffect(() => {
    if (!abierto) {
      setTipo("tienda");
      setPuestoId("");
      setClienteNombre("");
      setClienteTelefono("");
      setMonto("");
      setMetodoPago("efectivo");
      setDetalle("");
      setError(null);
    }
  }, [abierto]);

  async function guardar() {
    setError(null);
    const montoNum = Number(monto);
    if (!isFinite(montoNum) || montoNum <= 0) {
      setError("Monto debe ser mayor a 0");
      return;
    }
    if (tipo === "tienda" && !puestoId) {
      setError("Elige una tienda");
      return;
    }
    if (tipo === "mandado" && !clienteNombre.trim()) {
      setError("Pon el nombre del cliente");
      return;
    }

    setGuardando(true);
    try {
      const body = {
        tipo,
        puesto_id: tipo === "tienda" ? puestoId : undefined,
        cliente_nombre: tipo === "mandado" ? clienteNombre.trim() : undefined,
        cliente_telefono: tipo === "mandado" ? clienteTelefono.trim() : undefined,
        monto: montoNum,
        metodo_pago: metodoPago,
        detalle: detalle.trim() || undefined,
      };
      const res = await fetch("/api/repartidor/ingresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Error al guardar");
        return;
      }
      onGuardado();
      onClose();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={abierto}
      onClose={onClose}
      titulo="Registrar venta manual"
      footer={
        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full bg-brand text-white font-bold py-3 rounded-xl disabled:opacity-60 active:scale-95 transition-transform"
        >
          {guardando ? "Guardando…" : "Guardar ingreso"}
        </button>
      }
    >
      <div className="space-y-4">
        {/* Aclaración importante: solo ganancia Mercadito */}
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-lg">
          💡 Captura <b>solo la ganancia de Mercadito</b> (envío + servicio + propina), no el ticket completo del cliente.
        </div>

        {/* Tipo: tienda o mandado */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">¿De qué fue el pedido?</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("tienda")}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                tipo === "tienda"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-600 border-gray-300"
              }`}
            >
              🏪 Compra en tienda
            </button>
            <button
              type="button"
              onClick={() => setTipo("mandado")}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                tipo === "mandado"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-600 border-gray-300"
              }`}
            >
              🛵 Mandado de cliente
            </button>
          </div>
        </div>

        {/* Tienda dropdown */}
        {tipo === "tienda" && (
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Tienda</label>
            <select
              value={puestoId}
              onChange={(e) => setPuestoId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white"
            >
              <option value="">Elige una tienda…</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cliente del mandado */}
        {tipo === "mandado" && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Cliente</label>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Teléfono (opcional)</label>
              <input
                type="tel"
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
                placeholder="10 dígitos"
                inputMode="numeric"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm"
              />
            </div>
          </>
        )}

        {/* Monto */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Monto (ganancia Mercadito)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="text"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-300 text-base font-bold"
            />
          </div>
        </div>

        {/* Método de pago */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Cómo te pagaron</label>
          <div className="grid grid-cols-3 gap-2">
            {(["efectivo", "transferencia", "tarjeta"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodoPago(m)}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  metodoPago === m
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Detalle (opcional)</label>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Ej: 2 órdenes de pastor + Coca · entregado en Tepeyac"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
