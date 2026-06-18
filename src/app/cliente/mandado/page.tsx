"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import ClienteLogin from "@/components/ClienteLogin";
import { useSession } from "@/components/SessionProvider";
import { calcularRutaMandado, haversineKm } from "@/lib/geo";

// Dos mapas distintos por paso:
// - Origen: solo marcador (MapaUbicacionTienda), sin ruta — antes pintaba
//   una ruta desde el centro del mercado al origen, lo que confundía.
// - Destino: con ruta desde el origen elegido al destino (MapaEntrega).
const MapaUbicacionTienda = dynamic(() => import("@/components/MapaUbicacionTienda"), { ssr: false });
const MapaEntrega = dynamic(() => import("@/components/MapaEntrega"), { ssr: false });

const RECARGO_TARJETA = 0.0406;
const MIN_DISTANCIA_KM = 0.1;
type Paso = "origen" | "destino" | "pago";

// Tipos rápidos: cambian el placeholder de "qué necesitas" para que el cliente
// no enfrente un campo de texto en blanco. No se persiste — solo guía el copy.
const TIPOS_MANDADO = [
  { id: "comprar",  emoji: "🛒", label: "Comprar",     placeholder: "Ej. 2 kg de tortillas en La Estrella" },
  { id: "comida",   emoji: "🍔", label: "Comida",      placeholder: "Ej. 2 hamburguesas sin cebolla" },
  { id: "medicina", emoji: "💊", label: "Medicinas",   placeholder: "Ej. Paracetamol 500mg, 2 cajas" },
  { id: "recoger",  emoji: "📦", label: "Recoger",     placeholder: "Ej. recoger sobre con María" },
  { id: "docs",     emoji: "📄", label: "Documentos",  placeholder: "Ej. recoger contrato firmado" },
  { id: "otro",     emoji: "✏️", label: "Otro",        placeholder: "Describe qué necesitas" },
] as const;
type TipoMandadoId = typeof TIPOS_MANDADO[number]["id"];

// ETA: 4 min/km + 15 min buffer (recogida + tráfico). Mostrado como rango.
function calcularEta(km: number) {
  const min = Math.max(20, Math.round(km * 4 + 15));
  return `${min}-${min + 10} min`;
}

/**
 * /cliente/mandado — el cliente le pide al repartidor que vaya a un origen,
 * recoja o compre algo, y lo entregue en su domicilio. Toggle "ida y vuelta"
 * cuando el repartidor debe regresar al origen (firma, devolución, llaves).
 *
 * Espejo de mobile/app/mandado.tsx — mismas constantes, misma lógica, mismo
 * stepper origen → destino → pago. Llega al mismo POST /api/cliente/solicitar-mandado.
 */
export default function MandadoPage() {
  const router = useRouter();
  const { usuario } = useSession();
  const [paso, setPaso] = useState<Paso>("origen");

  // Origen
  const [origenLugar, setOrigenLugar] = useState("");
  const [origenTel, setOrigenTel] = useState("");
  const [origenDir, setOrigenDir] = useState("");
  const [origenNumero, setOrigenNumero] = useState("");
  const [origenDetalles, setOrigenDetalles] = useState("");
  const [origenUbic, setOrigenUbic] = useState<{ lat: number; lng: number } | null>(null);

  // Mandado
  const [tipoMandado, setTipoMandado] = useState<TipoMandadoId>("otro");
  const [descripcion, setDescripcion] = useState("");
  const [montoMandado, setMontoMandado] = useState("");
  const [idaVuelta, setIdaVuelta] = useState(false);
  const tipoActual = TIPOS_MANDADO.find((t) => t.id === tipoMandado) ?? TIPOS_MANDADO[5];

  // Destino (auto-rellena con sesión si está en localStorage)
  const [destNombre, setDestNombre] = useState("");
  const [destTel, setDestTel] = useState("");
  const [destDir, setDestDir] = useState("");
  const [destNumero, setDestNumero] = useState("");
  const [destDetalles, setDestDetalles] = useState("");
  const [destUbic, setDestUbic] = useState<{ lat: number; lng: number } | null>(null);
  // Instrucciones / monto en destino — opcionales. Útil para casos como
  // "pregunta por Juan y entrégale" o "le cobras $X al recibir".
  const [destDescripcion, setDestDescripcion] = useState("");
  const [destMontoTxt, setDestMontoTxt] = useState("");

  // Pago
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Guard síncrono anti doble-tap: evita un segundo mandado duplicado antes de
  // que `enviando` deshabilite el botón en el re-render.
  const enviandoRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Distancia / costo
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [calculando, setCalculando] = useState(false);
  const [fueraDeCobertura, setFueraDeCobertura] = useState(false);

  // Auto-rellena con datos del usuario en sesión (si existe).
  useEffect(() => {
    if (!usuario) return;
    setDestNombre((p) => p || usuario.nombre || "");
    setDestTel((p) => p || usuario.telefono || "");
  }, [usuario]);

  // Recalcula la ruta cada vez que cambia origen, destino o ida+vuelta.
  useEffect(() => {
    if (!origenUbic || !destUbic) {
      setDistanciaKm(0);
      setCostoEnvio(0);
      setFueraDeCobertura(false);
      return;
    }
    let cancel = false;
    setCalculando(true);
    calcularRutaMandado(
      { lat: origenUbic.lat, lng: origenUbic.lng, nombre: origenLugar || "Origen" },
      destUbic.lat,
      destUbic.lng,
      idaVuelta,
    )
      .then((ruta) => {
        if (cancel) return;
        setDistanciaKm(ruta.distanciaKm);
        setCostoEnvio(ruta.costoEnvio);
        setFueraDeCobertura(ruta.distanciaKm > 20 * (idaVuelta ? 2 : 1));
      })
      .finally(() => { if (!cancel) setCalculando(false); });
    return () => { cancel = true; };
  }, [origenUbic, destUbic, idaVuelta, origenLugar]);

  const monto = Number(montoMandado) || 0;
  const destMonto = Number(destMontoTxt) || 0;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * RECARGO_TARJETA * 100) / 100 : 0;
  const total = costoEnvio + recargoTarjeta + monto + destMonto;

  const origenIgualDestino = useMemo(() => {
    if (!origenUbic || !destUbic) return false;
    return haversineKm(origenUbic.lat, origenUbic.lng, destUbic.lat, destUbic.lng) < MIN_DISTANCIA_KM;
  }, [origenUbic, destUbic]);

  const direccionOrigenFmt = `${origenDir} #${origenNumero}${origenDetalles ? " — " + origenDetalles : ""}`;
  const direccionDestinoFmt = `${destDir} #${destNumero}${destDetalles ? " — " + destDetalles : ""}`;

  // Telefonos opcionales: a veces el cliente no tiene el número de la tienda
  // y el repartidor lo contacta a él directo. Si se llena, validamos 10 dígitos.
  const origenTelOk = origenTel.trim() === "" || origenTel.replace(/\D/g, "").length === 10;
  const destTelOk = destTel.trim() === "" || destTel.replace(/\D/g, "").length === 10;
  const origenOk = !!(origenLugar && origenTelOk && origenDir && origenNumero && origenUbic && descripcion.trim().length >= 3);
  const destinoOk = !!(destNombre && destTelOk && destDir && destNumero && destUbic && costoEnvio > 0 && !origenIgualDestino && !fueraDeCobertura);
  const pagoOk = metodoPago !== "transferencia" || (comprobante && comprobante.length > 50);
  const puedeEnviar = origenOk && destinoOk && pagoOk;

  function elegirComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") setComprobante(result);
    };
    reader.readAsDataURL(file);
  }

  async function solicitar() {
    if (!puedeEnviar || !origenUbic || !destUbic) return;
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/cliente/solicitar-mandado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origen_nombre: origenLugar,
          origen_telefono: origenTel,
          origen_direccion: direccionOrigenFmt,
          origen_lat: origenUbic.lat,
          origen_lng: origenUbic.lng,
          destino_nombre: destNombre,
          destino_telefono: destTel,
          destino_direccion: direccionDestinoFmt,
          destino_lat: destUbic.lat,
          destino_lng: destUbic.lng,
          descripcion: descripcion.trim(),
          monto_mandado: monto,
          destino_descripcion: destDescripcion.trim() || null,
          destino_monto: destMonto,
          ida_vuelta: idaVuelta,
          metodo_pago: metodoPago,
          ...(metodoPago === "transferencia" && comprobante ? { comprobante_pago: comprobante } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear el mandado");
        enviandoRef.current = false;
        setEnviando(false);
        return;
      }
      router.replace("/cliente?tab=pedidos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  function siguiente() {
    setError(null);
    if (paso === "origen") {
      if (!origenOk) { setError("Completa el origen, marca el punto en el mapa, y describe qué necesitas (mín. 3 caracteres)"); return; }
      setPaso("destino");
    } else if (paso === "destino") {
      if (origenIgualDestino) { setError("El origen y destino son el mismo lugar"); return; }
      if (fueraDeCobertura) { setError("Fuera de cobertura (más de 20 km)"); return; }
      if (!destinoOk) { setError("Completa el destino y espera el cálculo del costo"); return; }
      setPaso("pago");
    }
  }

  function atras() {
    setError(null);
    if (paso === "destino") setPaso("origen");
    else if (paso === "pago") setPaso("destino");
  }

  const pasos: Paso[] = ["origen", "destino", "pago"];
  const labels: Record<Paso, string> = { origen: "Origen", destino: "Destino", pago: "Pago" };

  const origenesParaDestino = origenUbic ? [{ lat: origenUbic.lat, lng: origenUbic.lng, nombre: origenLugar || "Origen" }] : [];

  // Login gate: solo clientes logueados pueden pedir mandados (mismo permiso
  // que /api/cliente/solicitar-mandado). Quien no esté logueado ve el form
  // de teléfono + PIN. Si el teléfono no existe, se crea cuenta — igual que
  // en /cliente al hacer una compra.
  if (!usuario || usuario.rol !== "cliente") {
    return (
      <div className="min-h-screen bg-cream flex flex-col">
        <Header title="Pedir mandado" />
        <main className="flex-1 max-w-lg w-full mx-auto px-4">
          <ClienteLogin
            titulo="Pedir un mandado"
            subtitulo="Necesitamos tu teléfono para que el repartidor pueda contactarte"
            textoBoton="Continuar"
            onLoggedIn={() => { /* el provider re-renderiza con usuario, esta vista se desmonta */ }}
          />
          <Link href="/cliente" className="block text-center text-sm text-gray-500 mt-2 mb-6">
            ← Volver al inicio
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col pb-32">
      <Header title="Pedir mandado" />

      {/* Stepper */}
      <div className="bg-white border-b sticky top-14 z-30">
        <div className="max-w-lg mx-auto flex">
          {pasos.map((p, i) => {
            const activo = paso === p;
            const completo = (p === "origen" && origenOk) || (p === "destino" && destinoOk);
            return (
              <button
                key={p}
                onClick={() => setPaso(p)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  activo ? "bg-brand text-white" : completo ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                }`}
              >
                {i + 1}. {labels[p]}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 max-w-lg w-full mx-auto p-3 space-y-3">
        {/* PASO 1: ORIGEN */}
        {paso === "origen" && (
          <>
            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">¿Qué necesitas?</h3>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_MANDADO.map((t) => {
                  const activo = tipoMandado === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipoMandado(t.id)}
                      className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-colors ${
                        activo ? "bg-orange-50 border-brand text-orange-900" : "bg-white border-gray-200 text-gray-500"
                      }`}
                    >
                      {t.emoji} {t.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={tipoActual.placeholder}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
              />
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">¿De dónde recogen?</h3>
              <input
                value={origenLugar}
                onChange={(e) => setOrigenLugar(e.target.value)}
                placeholder="Ej. Farmacia Similares"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
              <input
                value={origenTel}
                onChange={(e) => setOrigenTel(e.target.value)}
                placeholder="Tel del lugar (opcional)"
                inputMode="tel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">Dirección del origen</h3>
              <MapaUbicacionTienda
                ubicacionInicial={origenUbic}
                onUbicacionSeleccionada={(lat, lng) => setOrigenUbic({ lat, lng })}
                onDireccionDetectada={setOrigenDir}
              />
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-700 font-medium">{origenDir || "Toca el mapa o busca para detectar la calle"}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">📍 Auto-detectada del mapa · pica para cambiar</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Número del local</label>
                <input
                  value={origenNumero}
                  onChange={(e) => setOrigenNumero(e.target.value)}
                  placeholder="Ej. 42, Local 3…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
                <input
                  value={origenDetalles}
                  onChange={(e) => setOrigenDetalles(e.target.value)}
                  placeholder="Ej. al lado del Oxxo, color verde…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">💵 ¿Cuánto cobrar al entregar?</h3>
              <input
                value={montoMandado}
                onChange={(e) => setMontoMandado(e.target.value)}
                placeholder="Ej. 250 — vacío si no hay pago"
                inputMode="decimal"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
              <p className="text-[11px] text-gray-500">Se cobra al entregar. Vacío si no hay nada que pagar.</p>
            </div>
          </>
        )}

        {/* PASO 2: DESTINO + IDA Y VUELTA */}
        {paso === "destino" && (
          <>
            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">¿Dónde entregar?</h3>
              <input
                value={destNombre}
                onChange={(e) => setDestNombre(e.target.value)}
                placeholder="Nombre de quien recibe"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
              <input
                value={destTel}
                onChange={(e) => setDestTel(e.target.value)}
                placeholder="WhatsApp (opcional)"
                inputMode="tel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">Dirección de entrega</h3>
              <MapaEntrega
                ubicacionInicial={destUbic}
                onUbicacionSeleccionada={({ lat, lng }) => setDestUbic({ lat, lng })}
                onDireccionDetectada={setDestDir}
                origenes={origenesParaDestino}
              />
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-700 font-medium">{destDir || "Toca el mapa o busca para detectar la calle"}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">📍 Auto-detectada del mapa · pica para cambiar</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">No. de casa o apartamento</label>
                <input
                  value={destNumero}
                  onChange={(e) => setDestNumero(e.target.value)}
                  placeholder="Ej. 42, Int. 3…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
                <input
                  value={destDetalles}
                  onChange={(e) => setDestDetalles(e.target.value)}
                  placeholder="Ej. casa azul, frente al parque…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              {origenIgualDestino && (
                <p className="text-xs text-red-700 font-semibold">⚠️ El origen y destino son el mismo lugar</p>
              )}
              {distanciaKm > 0 && !origenIgualDestino && (
                <div className="border-t border-gray-100 pt-2 mt-1">
                  <p className="text-sm text-gray-800 font-semibold">
                    {idaVuelta ? "🔁 Ida + vuelta" : "🚚 Ida"}: {distanciaKm.toFixed(1)} km · {calculando ? "calculando..." : `$${costoEnvio.toFixed(0)}`}
                  </p>
                  {!calculando && (
                    <p className="text-xs text-gray-600 mt-0.5">⏱️ Llegada estimada: {calcularEta(distanciaKm)}</p>
                  )}
                </div>
              )}
              {fueraDeCobertura && (
                <p className="text-xs text-red-700 font-semibold">⚠️ Fuera de cobertura (más de 20 km)</p>
              )}
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">¿Qué necesitas que haga aquí? <span className="text-gray-400 font-normal">(opcional)</span></h3>
              <textarea
                value={destDescripcion}
                onChange={(e) => setDestDescripcion(e.target.value)}
                placeholder="Ej. pregunta por Juan y entrégale; deja en recepción…"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
              />
              <h3 className="font-bold text-sm text-gray-700 pt-1">Monto en destino <span className="text-gray-400 font-normal">(si aplica)</span></h3>
              <input
                value={destMontoTxt}
                onChange={(e) => setDestMontoTxt(e.target.value)}
                placeholder="Ej. 50 (vacío si no aplica)"
                inputMode="decimal"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
              <p className="text-[11px] text-gray-500">Para casos donde le cobras o pagas algo a quien recibe.</p>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-gray-700">🔁 ¿Necesita regresar?</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Para devolver llaves, firmas o cambio.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIdaVuelta((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${idaVuelta ? "bg-brand" : "bg-gray-300"}`}
                  aria-pressed={idaVuelta}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${idaVuelta ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </label>
            </div>
          </>
        )}

        {/* PASO 3: PAGO */}
        {paso === "pago" && (
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2 text-sm">
              <div>
                <p className="text-[10px] font-bold text-yellow-900 uppercase">📤 Origen</p>
                <p className="text-gray-800 font-medium">{origenLugar} <span className="text-gray-500 font-normal">· {origenTel}</span></p>
                <p className="text-xs text-gray-600 mt-0.5">{direccionOrigenFmt}</p>
              </div>
              <div className="border-t border-yellow-200" />
              <div>
                <p className="text-[10px] font-bold text-yellow-900 uppercase">🛍️ Mandado {idaVuelta ? "· Ida y vuelta" : ""}</p>
                <p className="text-gray-800">{descripcion}</p>
                {monto > 0 && <p className="text-xs text-gray-600 mt-0.5">Cobrar al entregar el mandado: ${monto.toFixed(2)}</p>}
              </div>
              <div className="border-t border-yellow-200" />
              <div>
                <p className="text-[10px] font-bold text-yellow-900 uppercase">📥 Destino</p>
                <p className="text-gray-800 font-medium">{destNombre} <span className="text-gray-500 font-normal">· {destTel}</span></p>
                <p className="text-xs text-gray-600 mt-0.5">{direccionDestinoFmt}</p>
                {destDescripcion.trim() && <p className="text-xs text-gray-700 mt-1">📝 {destDescripcion.trim()}</p>}
                {destMonto > 0 && <p className="text-xs text-gray-600 mt-0.5">Monto en destino: ${destMonto.toFixed(2)}</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-bold text-sm text-gray-700">Método de pago</h3>
              <div className="flex gap-1.5">
                {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                      metodoPago === m ? "bg-brand border-brand text-white" : "bg-white border-gray-200 text-gray-500"
                    }`}
                  >
                    {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "🏦 Transfer."}
                  </button>
                ))}
              </div>
              {metodoPago === "tarjeta" && (
                <p className="text-[11px] text-gray-500">Recargo 4.06% por tarjeta: ${recargoTarjeta.toFixed(2)}</p>
              )}
              {metodoPago === "transferencia" && (
                <div className="pt-1">
                  <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer text-sm font-semibold text-gray-700">
                    ☁️ {comprobante ? "Cambiar comprobante" : "Subir comprobante"}
                    <input type="file" accept="image/*" onChange={elegirComprobante} className="hidden" />
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {comprobante && <img src={comprobante} alt="Comprobante" className="mt-2 h-24 rounded-lg" />}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-3.5 shadow-sm">
              <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-500">Costo del mandado</span><span>${costoEnvio.toFixed(2)}</span></div>
              {recargoTarjeta > 0 && <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-500">Recargo tarjeta</span><span>${recargoTarjeta.toFixed(2)}</span></div>}
              {monto > 0 && <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-500">Monto en origen</span><span>${monto.toFixed(2)}</span></div>}
              {destMonto > 0 && <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-500">Monto en destino</span><span>${destMonto.toFixed(2)}</span></div>}
              <div className="flex justify-between border-t border-gray-100 pt-2 mt-1">
                <span className="font-bold text-gray-800">Total a pagar al entregar</span>
                <span className="font-bold text-brand text-lg">${total.toFixed(2)}</span>
              </div>
              {distanciaKm > 0 && (
                <p className="text-xs text-gray-600 text-center mt-2">⏱️ Llegada estimada: {calcularEta(distanciaKm)}</p>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
      </main>

      {/* Footer fijo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex gap-2 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="max-w-lg mx-auto w-full flex gap-2">
          {paso !== "origen" ? (
            <button onClick={atras} className="flex-1 bg-gray-100 text-gray-600 rounded-full py-3 font-bold text-sm">
              ← Atrás
            </button>
          ) : (
            <Link href="/cliente" className="flex-1 bg-gray-100 text-gray-600 rounded-full py-3 font-bold text-sm text-center">
              ← Cancelar
            </Link>
          )}
          {paso !== "pago" ? (
            <button onClick={siguiente} className="flex-[2] bg-brand text-white rounded-full py-3 font-bold text-sm">
              Continuar →
            </button>
          ) : (
            <button
              onClick={solicitar}
              disabled={!puedeEnviar || enviando}
              className="flex-[2] bg-brand text-white rounded-full py-3 font-bold text-sm disabled:opacity-50"
            >
              {enviando ? "Solicitando..." : `Solicitar · $${total.toFixed(0)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
