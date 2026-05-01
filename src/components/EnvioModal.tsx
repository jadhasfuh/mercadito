"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

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
  const [recogeUbicacion, setRecogeUbicacion] = useState<{ lat: number; lng: number } | null>(null);

  // Entrega (destinatario)
  const [destNombre, setDestNombre] = useState("");
  const [destTelefono, setDestTelefono] = useState("");
  const [destDireccion, setDestDireccion] = useState("");
  const [destUbicacion, setDestUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [costoEnvio, setCostoEnvio] = useState(0);

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

  if (!abierto) return null;

  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * 0.0406) : 0;
  const total = costoEnvio + recargoTarjeta;

  const recogidaCompleta = !!(recogeNombre && recogeTelefono && recogeDireccion && recogeUbicacion);
  const entregaCompleta = !!(destNombre && destTelefono && destDireccion && destUbicacion && costoEnvio > 0);
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
          direccion_entrega: `${destDireccion} [${destUbicacion!.lat.toFixed(6)}, ${destUbicacion!.lng.toFixed(6)}]`,
          // Recogida.
          recogida_nombre: recogeNombre,
          recogida_telefono: recogeTelefono,
          direccion_recogida: `${recogeDireccion} [${recogeUbicacion!.lat.toFixed(6)}, ${recogeUbicacion!.lng.toFixed(6)}]`,
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
        setError(data.error || "No se pudo crear el envío");
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📦</span>
            <div>
              <h2 className="font-bold text-gray-900">Mandar paquete</h2>
              <p className="text-[11px] text-gray-500">Sahuayo, Jiquilpan, V. Carranza · máx 10 kg</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-2">×</button>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-gray-100 text-[11px] font-bold">
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
                className={`flex-1 py-2 ${activo ? "bg-brand text-white" : completo ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}
              >
                {i + 1}. {p[0].toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-4">
          {/* PASO 1: RECOGIDA */}
          {paso === "recogida" && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                ¿De dónde recogemos el paquete? El repartidor irá ahí primero.
              </div>
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
                <input
                  type="text"
                  value={recogeDireccion}
                  onChange={(e) => setRecogeDireccion(e.target.value)}
                  placeholder="Calle, colonia, número, referencias..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                />
                <div className="h-64 rounded-lg overflow-hidden">
                  <MapaUbicacionTienda
                    ubicacionInicial={recogeUbicacion}
                    onUbicacionSeleccionada={(lat, lng) => setRecogeUbicacion({ lat, lng })}
                    onDireccionDetectada={(d) => { if (!recogeDireccion) setRecogeDireccion(d); }}
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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                ¿A dónde lo entregamos? El costo se calcula con la distancia desde la recogida.
              </div>
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
                <input
                  type="text"
                  value={destDireccion}
                  onChange={(e) => setDestDireccion(e.target.value)}
                  placeholder="Calle, colonia, número..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                />
                <div className="h-64 rounded-lg overflow-hidden">
                  <MapaEntrega
                    ubicacionInicial={destUbicacion}
                    origenes={recogeUbicacion ? [{ lat: recogeUbicacion.lat, lng: recogeUbicacion.lng, nombre: "Recogida" }] : []}
                    onUbicacionSeleccionada={(data) => {
                      setDestUbicacion({ lat: data.lat, lng: data.lng });
                      setCostoEnvio(data.costoEnvio);
                    }}
                    onDireccionDetectada={(d) => { if (!destDireccion) setDestDireccion(d); }}
                  />
                </div>
                {costoEnvio > 0 && (
                  <p className="text-xs text-gray-600 mt-2">
                    Costo de envío: <strong className="text-brand-dark">${costoEnvio.toFixed(2)}</strong>
                  </p>
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
                  placeholder="Ej: Documentos, ropa, comida, regalo..."
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
}
