"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";

const MapaUbicacionTienda = dynamic(() => import("./MapaUbicacionTienda"), { ssr: false });
const MapaEntrega = dynamic(() => import("./MapaEntrega"), { ssr: false });

interface Props {
  abierto: boolean;
  onClose: () => void;
  onCreado: (pedidoId: string) => void;
  /** Datos del usuario logueado para precargar campos. */
  usuarioNombre?: string;
  usuarioTelefono?: string;
}

type Paso = "recogida" | "entrega" | "paquete" | "pago";

// ETA: 4 min/km + 15 min de buffer (recogida + tráfico). Mostrado como rango.
function calcularEta(km: number) {
  const min = Math.max(20, Math.round(km * 4 + 15));
  return `${min}-${min + 10} min`;
}

/**
 * Modal para crear un envío de paquete entre Sahuayo, Jiquilpan y V. Carranza.
 * Reusa pedidos.tipo='envio' — el repartidor lo ve en su misma bandeja.
 *
 * Costo de envío: igual que pedido normal — basado en distancia desde el
 * punto de recogida al destino. MapaEntrega calcula el costo cuando le
 * pasamos la recogida como `origenes`.
 */
export default function EnvioModal({ abierto, onClose, onCreado, usuarioNombre, usuarioTelefono }: Props) {
  const [paso, setPaso] = useState<Paso>("recogida");

  // Recogida (quién envía)
  const [recogeNombre, setRecogeNombre] = useState("");
  const [recogeTelefono, setRecogeTelefono] = useState("");
  const [recogeDireccion, setRecogeDireccion] = useState("");
  const [recogeNumero, setRecogeNumero] = useState("");
  const [recogeDetalles, setRecogeDetalles] = useState("");
  const [recogeUbicacion, setRecogeUbicacion] = useState<{ lat: number; lng: number } | null>(null);

  // Entrega (destinatario)
  const [destNombre, setDestNombre] = useState("");
  const [destTelefono, setDestTelefono] = useState("");
  const [destDireccion, setDestDireccion] = useState("");
  const [destNumero, setDestNumero] = useState("");
  const [destDetalles, setDestDetalles] = useState("");
  const [destUbicacion, setDestUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [distanciaKm, setDistanciaKm] = useState(0);

  // Paquete
  const [pesoKg, setPesoKg] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPeligrosos, setAceptaPeligrosos] = useState(false);

  // Pago
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobante, setComprobante] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precargar nombre/teléfono del usuario para "envía" (lo más común: el
  // mismo cliente lo manda; puede cambiar si lo recoge otra persona).
  useEffect(() => {
    if (abierto) {
      setRecogeNombre(usuarioNombre || "");
      setRecogeTelefono(usuarioTelefono || "");
    }
  }, [abierto, usuarioNombre, usuarioTelefono]);

  // Reset al cerrar.
  useEffect(() => {
    if (!abierto) {
      setPaso("recogida");
      setError(null);
    }
  }, [abierto]);

  // Bloquear scroll del fondo cuando el modal está abierto.
  useEffect(() => {
    if (!abierto) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [abierto]);

  if (!abierto) return null;
  if (typeof document === "undefined") return null;

  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * 0.0406 * 100) / 100 : 0;
  const total = costoEnvio + recargoTarjeta;

  const recogidaCompleta = !!(recogeNombre && recogeTelefono && recogeDireccion && recogeNumero && recogeUbicacion);
  const entregaCompleta = !!(destNombre && destTelefono && destDireccion && destNumero && destUbicacion && costoEnvio > 0);

  // Direcciones formateadas para mostrar y guardar.
  const direccionRecogidaFmt = `${recogeDireccion} #${recogeNumero}${recogeDetalles ? " — " + recogeDetalles : ""}`;
  const direccionEntregaFmt = `${destDireccion} #${destNumero}${destDetalles ? " — " + destDetalles : ""}`;
  const paqueteCompleto = !!(pesoKg && Number(pesoKg) > 0 && Number(pesoKg) <= 10 && descripcion.trim().length >= 3 && aceptaTerminos && aceptaPeligrosos);
  const puedeEnviar = recogidaCompleta && entregaCompleta && paqueteCompleto && (metodoPago !== "transferencia" || (comprobante && comprobante.length > 50));

  async function enviarSolicitud() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "envio",
          // Destinatario va como cliente del pedido (es quien recibe).
          cliente_nombre: destNombre,
          cliente_telefono: destTelefono,
          zona_id: "custom",
          direccion_entrega: `${direccionEntregaFmt} [${destUbicacion!.lat.toFixed(6)}, ${destUbicacion!.lng.toFixed(6)}]`,
          // Recogida.
          recogida_nombre: recogeNombre,
          recogida_telefono: recogeTelefono,
          direccion_recogida: `${direccionRecogidaFmt} [${recogeUbicacion!.lat.toFixed(6)}, ${recogeUbicacion!.lng.toFixed(6)}]`,
          recogida_lat: recogeUbicacion!.lat,
          recogida_lng: recogeUbicacion!.lng,
          // Paquete.
          peso_kg: Number(pesoKg),
          descripcion_contenido: descripcion.trim(),
          // Costo y pago.
          costo_envio_override: costoEnvio,
          metodo_pago: metodoPago,
          comprobante_pago: metodoPago === "transferencia" ? comprobante : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 401 = sin sesión; el cliente debe loguearse con PIN antes de mandar.
        if (res.status === 401) {
          setError(data.error || "Inicia sesión con tu teléfono y PIN para mandar paquete.");
        } else {
          setError(data.error || "No se pudo crear el envío");
        }
        return;
      }
      onCreado(data.id);
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setEnviando(false);
    }
  }

  function handleComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setComprobante(String(reader.result));
    reader.readAsDataURL(f);
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/50 md:flex md:items-center md:justify-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white flex flex-col h-full w-full md:h-auto md:max-h-[92vh] md:max-w-lg md:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fijo arriba */}
        <div className="shrink-0 bg-white border-b border-gray-100 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">📦</span>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 truncate">Mandar paquete</h2>
              <p className="text-[11px] text-gray-500 truncate">Sahuayo, Jiquilpan, V. Carranza · máx 10 kg</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 text-3xl leading-none px-2 shrink-0">×</button>
        </div>

        {/* Stepper — fijo */}
        <div className="shrink-0 flex border-b border-gray-100 text-[11px] font-bold">
          {(["recogida", "entrega", "paquete", "pago"] as Paso[]).map((p, i) => {
            const activo = paso === p;
            const completo =
              (p === "recogida" && recogidaCompleta) ||
              (p === "entrega" && entregaCompleta) ||
              (p === "paquete" && paqueteCompleto);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPaso(p)}
                className={`flex-1 py-2 ${activo ? "bg-brand text-white" : completo ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"}`}
              >
                {i + 1}. {p[0].toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Body — único scroll vertical */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* PASO 1: RECOGIDA */}
          {paso === "recogida" && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">QUIÉN ENVÍA</label>
                <input
                  type="text"
                  value={recogeNombre}
                  onChange={(e) => setRecogeNombre(e.target.value)}
                  placeholder="Nombre"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                />
                <input
                  type="tel"
                  value={recogeTelefono}
                  onChange={(e) => setRecogeTelefono(e.target.value)}
                  placeholder="Teléfono / WhatsApp"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">DIRECCIÓN DE RECOGIDA</label>
                <div className="h-64 rounded-lg overflow-hidden mb-2">
                  <MapaUbicacionTienda
                    ubicacionInicial={recogeUbicacion}
                    onUbicacionSeleccionada={(lat, lng) => setRecogeUbicacion({ lat, lng })}
                    onDireccionDetectada={setRecogeDireccion}
                  />
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
                  <p className="text-sm text-gray-700 font-medium">{recogeDireccion || "Toca el mapa o busca para detectar la calle"}</p>
                  <p className="text-[11px] text-gray-500">📍 Auto-detectada · busca o pica el mapa para cambiar</p>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="text"
                    value={recogeNumero}
                    onChange={(e) => setRecogeNumero(e.target.value)}
                    placeholder="No. casa"
                    className="col-span-1 border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <input
                    type="text"
                    value={recogeDetalles}
                    onChange={(e) => setRecogeDetalles(e.target.value)}
                    placeholder="Detalles (color, referencias…)"
                    className="col-span-2 border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <button
                disabled={!recogidaCompleta}
                onClick={() => setPaso("entrega")}
                className="w-full py-3 bg-brand text-white rounded-full font-bold disabled:bg-gray-200"
              >
                Continuar →
              </button>
            </>
          )}

          {/* PASO 2: ENTREGA */}
          {paso === "entrega" && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">QUIÉN RECIBE</label>
                <input
                  type="text"
                  value={destNombre}
                  onChange={(e) => setDestNombre(e.target.value)}
                  placeholder="Nombre del destinatario"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                />
                <input
                  type="tel"
                  value={destTelefono}
                  onChange={(e) => setDestTelefono(e.target.value)}
                  placeholder="Teléfono / WhatsApp"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">DIRECCIÓN DE ENTREGA</label>
                <div className="h-64 rounded-lg overflow-hidden mb-2">
                  <MapaEntrega
                    ubicacionInicial={destUbicacion}
                    origenes={recogeUbicacion ? [{ lat: recogeUbicacion.lat, lng: recogeUbicacion.lng, nombre: "Recogida" }] : []}
                    onUbicacionSeleccionada={(data) => {
                      setDestUbicacion({ lat: data.lat, lng: data.lng });
                      // Piso $12 para envíos (refleja costo extra de ir a
                      // recoger al origen). Pero si MapaEntrega devolvió 0
                      // significa fuera de cobertura (>20 km) — no aplicar
                      // piso, dejar en 0 para bloquear continuar.
                      setCostoEnvio(data.costoEnvio > 0 ? Math.max(12, data.costoEnvio) : 0);
                      setDistanciaKm(data.distanciaKm);
                    }}
                    onDireccionDetectada={setDestDireccion}
                  />
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
                  <p className="text-sm text-gray-700 font-medium">{destDireccion || "Toca el mapa o busca para detectar la calle"}</p>
                  <p className="text-[11px] text-gray-500">📍 Auto-detectada · busca o pica el mapa para cambiar</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={destNumero}
                    onChange={(e) => setDestNumero(e.target.value)}
                    placeholder="No. casa"
                    className="col-span-1 border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <input
                    type="text"
                    value={destDetalles}
                    onChange={(e) => setDestDetalles(e.target.value)}
                    placeholder="Detalles (color, referencias…)"
                    className="col-span-2 border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                {costoEnvio > 0 && (
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <p className="text-sm text-gray-800 font-semibold">
                      🚚 {distanciaKm.toFixed(1)} km · ${costoEnvio.toFixed(0)}
                    </p>
                    {distanciaKm > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">⏱️ Llegada estimada: {calcularEta(distanciaKm)}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPaso("recogida")} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-full font-bold">← Atrás</button>
                <button
                  disabled={!entregaCompleta}
                  onClick={() => setPaso("paquete")}
                  className="flex-1 py-3 bg-brand text-white rounded-full font-bold disabled:bg-gray-200"
                >
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* PASO 3: PAQUETE */}
          {paso === "paquete" && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">PESO APROXIMADO (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={pesoKg}
                  onChange={(e) => setPesoKg(e.target.value)}
                  placeholder="Ej: 1.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-[11px] text-gray-400 mt-1">Máximo 10 kg. Si excede, contacta a soporte.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">¿QUÉ ENVÍAS?</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. documentos, ropa, regalo"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 resize-none"
                />
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-red-800">⚠️ Importante</p>
                <label className="flex items-start gap-2 text-xs text-red-900">
                  <input
                    type="checkbox"
                    checked={aceptaTerminos}
                    onChange={(e) => setAceptaTerminos(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Declaro que el contenido <strong>NO incluye sustancias ilegales</strong> (drogas, armas, etc.).
                    Mercadito no se hace responsable y reportará a las autoridades cualquier intento.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-red-900">
                  <input
                    type="checkbox"
                    checked={aceptaPeligrosos}
                    onChange={(e) => setAceptaPeligrosos(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    El contenido <strong>no es peligroso</strong> (sin líquidos inflamables, animales vivos, productos perecederos sin empaque).
                  </span>
                </label>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setPaso("entrega")} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-full font-bold">← Atrás</button>
                <button
                  disabled={!paqueteCompleto}
                  onClick={() => setPaso("pago")}
                  className="flex-1 py-3 bg-brand text-white rounded-full font-bold disabled:bg-gray-200"
                >
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* PASO 4: PAGO */}
          {paso === "pago" && (
            <>
              {/* Resumen rápido del envío para confirmar antes de pagar. */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mb-0.5">📤 Envía</p>
                  <p className="font-medium text-gray-900">{recogeNombre} <span className="text-gray-400">·</span> <span className="text-gray-600">{recogeTelefono}</span></p>
                  <p className="text-gray-700 leading-snug">{direccionRecogidaFmt}</p>
                </div>
                <div className="border-t border-amber-200 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mb-0.5">📥 Recibe</p>
                  <p className="font-medium text-gray-900">{destNombre} <span className="text-gray-400">·</span> <span className="text-gray-600">{destTelefono}</span></p>
                  <p className="text-gray-700 leading-snug">{direccionEntregaFmt}</p>
                </div>
                <div className="border-t border-amber-200 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mb-0.5">📦 Paquete</p>
                  <p className="text-gray-700">
                    {pesoKg ? `${Number(pesoKg).toFixed(1)} kg` : "—"}
                    {descripcion ? ` · ${descripcion.trim()}` : ""}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">MÉTODO DE PAGO</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMetodoPago(m)}
                      className={`py-3 text-xs font-bold rounded-lg border-2 ${metodoPago === m ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-600"}`}
                    >
                      {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "🏦 Transfer."}
                    </button>
                  ))}
                </div>
                {metodoPago === "tarjeta" && (
                  <p className="text-[11px] text-gray-500 mt-2">Recargo 4.06% por tarjeta: ${recargoTarjeta.toFixed(2)}</p>
                )}
                {metodoPago === "transferencia" && (
                  <div className="mt-2 bg-blue-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-blue-900">Transfiere ${total.toFixed(2)} a la cuenta de Mercadito y sube el comprobante.</p>
                    <input type="file" accept="image/*" onChange={handleComprobante} className="text-xs" />
                    {comprobante && <p className="text-[11px] text-green-700">✓ Comprobante cargado</p>}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Costo de envío</span><span>${costoEnvio.toFixed(2)}</span></div>
                {recargoTarjeta > 0 && <div className="flex justify-between"><span className="text-gray-600">Recargo tarjeta</span><span>${recargoTarjeta.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1"><span>Total</span><span className="text-brand-dark">${total.toFixed(2)}</span></div>
                {distanciaKm > 0 && (
                  <p className="text-xs text-gray-600 text-center pt-1">⏱️ Llegada estimada: {calcularEta(distanciaKm)}</p>
                )}
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button onClick={() => setPaso("paquete")} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-full font-bold">← Atrás</button>
                <button
                  disabled={!puedeEnviar || enviando}
                  onClick={enviarSolicitud}
                  className="flex-1 py-3 bg-brand text-white rounded-full font-bold disabled:bg-gray-200"
                >
                  {enviando ? "Solicitando..." : "Solicitar envío"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
