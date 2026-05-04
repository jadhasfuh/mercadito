"use client";
import { useEffect, useState } from "react";
import PinInput from "./PinInput";
import { esPinValido, PIN_MENSAJE } from "@/lib/validators";

interface Props {
  onClose: () => void;
}

/**
 * Modal para crear / cambiar / quitar el PIN del cliente. Se abre desde la
 * barra "{nombre} · {tel}" en la pestaña de Pedidos. Al guardar se cierra
 * solo. Cualquier error del backend se muestra en el formulario.
 */
export default function PinManager({ onClose }: Props) {
  const [tienePin, setTienePin] = useState<boolean | null>(null);
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinNuevo2, setPinNuevo2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exito, setExito] = useState("");

  useEffect(() => {
    fetch("/api/auth/cliente-pin")
      .then((r) => r.json())
      .then((d) => setTienePin(!!d.tienePin))
      .catch(() => setTienePin(false));
  }, []);

  async function guardar(pin: string | null, requierePinActual: boolean) {
    setError("");
    setSaving(true);
    setExito("");
    try {
      const body: Record<string, string | null> = { pin };
      if (requierePinActual) body.pinActual = pinActual;
      const res = await fetch("/api/auth/cliente-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
      } else {
        setTienePin(data.tienePin);
        setExito(pin == null ? "PIN eliminado." : "PIN guardado.");
        setPinActual(""); setPinNuevo(""); setPinNuevo2("");
        setTimeout(onClose, 1200);
      }
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!esPinValido(pinNuevo)) {
      setError(PIN_MENSAJE);
      return;
    }
    if (pinNuevo !== pinNuevo2) {
      setError("Los PINs no coinciden");
      return;
    }
    guardar(pinNuevo, !!tienePin);
  }

  function quitar() {
    if (!confirm("¿Quitar el PIN? Cualquiera con tu teléfono podrá ver tus pedidos.")) return;
    guardar(null, true);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-800 text-lg">🔒 Configurar PIN</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3">
          <p className="text-sm text-gray-500 leading-snug">
            {tienePin === null
              ? "Cargando…"
              : tienePin
                ? "Cambia o quita tu PIN. Si lo cambias, los siguientes inicios de sesión usarán el nuevo."
                : "Crea un PIN de 6 dígitos para que nadie más pueda ver tus pedidos con tu teléfono."}
          </p>
          {tienePin && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 text-center">PIN actual</label>
              <PinInput value={pinActual} onChange={setPinActual} length={6} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 text-center">{tienePin ? "Nuevo PIN" : "PIN"}</label>
            <PinInput value={pinNuevo} onChange={setPinNuevo} length={6} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 text-center">Confírmalo</label>
            <PinInput
              value={pinNuevo2}
              onChange={setPinNuevo2}
              length={6}
              error={pinNuevo2.length === pinNuevo.length && pinNuevo2 !== pinNuevo}
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{error}</div>}
          {exito && <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">{exito}</div>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand text-white py-3 rounded-full font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
          >
            {saving ? "Guardando…" : tienePin ? "Cambiar PIN" : "Crear PIN"}
          </button>
          {tienePin && (
            <button
              type="button"
              onClick={quitar}
              disabled={saving}
              className="w-full text-red-600 text-sm py-2 disabled:opacity-50"
            >
              Quitar PIN
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
