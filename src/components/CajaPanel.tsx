"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMXN } from "@/lib/dinero";
import { fechaHoraMX } from "@/lib/fecha";

interface Turno { id: string; caja: string; fondo_inicial: number; abierto_at: string; abierto_por_nombre: string | null }
interface Movimiento { id: string; tipo: string; monto: number; motivo: string | null; usuario_nombre: string | null; created_at: string }
interface EstadoCaja {
  turno: Turno | null;
  movimientos?: Movimiento[];
  entradas?: number; retiros?: number; cuentas?: number;
  ventas_tarjeta?: number; ventas_transferencia?: number;
}
interface Corte {
  id: string; caja: string; fondo_inicial: number; abierto_at: string;
  cerrado_por_nombre: string | null;
  ventas_efectivo: number; ventas_tarjeta: number; ventas_transferencia: number;
  cuentas: number; propinas: number; entradas: number; retiros: number;
  esperado: number; declarado: number; diferencia: number;
  fondo_siguiente: number; nota: string | null;
}
interface CorteHistorial {
  id: string; caja: string; fondo_inicial: number; abierto_at: string; cerrado_at: string;
  abierto_por_nombre: string | null; cerrado_por_nombre: string | null;
  declarado: number | null; esperado: number | null; diferencia: number | null; nota: string | null;
}

const fecha = (iso: string) => fechaHoraMX(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Corte de caja a ciegas.
 *
 * El cajero abre el turno con un fondo, registra entradas y retiros durante el
 * día y al cerrar declara cuánto contó SIN ver cuánto debería haber. Recién
 * entonces aparece la diferencia, firmada con nombre y hora, y el turno queda
 * congelado. Ese orden es todo: si el esperado se ve antes, el conteo se ajusta
 * solo y el corte no detecta nada.
 *
 * `esDueno` sólo gatea el historial de cortes pasados — operar la caja lo puede
 * hacer también un mesero.
 */
export default function CajaPanel({ esDueno }: { esDueno: boolean }) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fondo, setFondo] = useState("");
  const [nombreCaja, setNombreCaja] = useState("Caja principal");
  const [movTipo, setMovTipo] = useState<"entrada" | "retiro" | null>(null);
  const [movMonto, setMovMonto] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [declarado, setDeclarado] = useState("");
  const [fondoSiguiente, setFondoSiguiente] = useState("");
  const [notaCierre, setNotaCierre] = useState("");
  const [corte, setCorte] = useState<Corte | null>(null);
  const [historial, setHistorial] = useState<CorteHistorial[] | null>(null);

  const cargar = useCallback(() => {
    fetch("/api/tienda/caja")
      .then((r) => (r.ok ? r.json() : { turno: null }))
      .then(setEstado)
      .catch(() => setEstado({ turno: null }))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(body: Record<string, unknown>) {
    setOcupado(true); setError(null);
    try {
      const res = await fetch("/api/tienda/caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "No se pudo completar"); return null; }
      return data;
    } finally {
      setOcupado(false);
    }
  }

  async function abrir() {
    const d = await accion({ action: "abrir", fondo_inicial: Number(fondo) || 0, caja: nombreCaja });
    if (d) { setFondo(""); cargar(); }
  }

  async function registrarMov() {
    if (!movTipo) return;
    const d = await accion({ action: "movimiento", tipo: movTipo, monto: Number(movMonto), motivo: movMotivo });
    if (d) { setMovTipo(null); setMovMonto(""); setMovMotivo(""); cargar(); }
  }

  async function cerrar() {
    const d = await accion({
      action: "cerrar",
      declarado: Number(declarado),
      fondo_siguiente: Number(fondoSiguiente) || 0,
      nota: notaCierre,
    });
    if (d?.corte) {
      setCorte(d.corte);
      setCerrando(false); setDeclarado(""); setFondoSiguiente(""); setNotaCierre("");
      cargar();
    }
  }

  function verHistorial() {
    fetch("/api/tienda/caja?historial=1")
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }

  if (cargando) return <div className="text-center text-gray-400 py-16">Cargando la caja…</div>;

  // ── Resultado del corte recién cerrado ────────────────────────────────
  if (corte) {
    const falta = corte.diferencia < 0;
    const cuadra = Math.abs(corte.diferencia) < 0.01;
    return (
      <div className="space-y-4">
        <section className="bg-white rounded-2xl p-5 shadow-sm print:shadow-none">
          <h3 className="font-extrabold text-lg text-gray-900">Corte de {corte.caja}</h3>
          <p className="text-xs text-gray-400 mb-4">
            {fecha(corte.abierto_at)} → ahora · cerró {corte.cerrado_por_nombre}
          </p>

          <div
            className={`rounded-2xl px-4 py-4 text-center ${cuadra ? "bg-emerald-50" : falta ? "bg-red-50" : "bg-amber-50"}`}
          >
            <p className={`text-[11px] font-bold uppercase tracking-wide ${cuadra ? "text-emerald-700" : falta ? "text-red-700" : "text-amber-700"}`}>
              {cuadra ? "La caja cuadra" : falta ? "Falta dinero" : "Sobra dinero"}
            </p>
            <p className={`text-3xl font-extrabold tabular-nums mt-1 ${cuadra ? "text-emerald-700" : falta ? "text-red-700" : "text-amber-700"}`}>
              {cuadra ? formatMXN(0) : `${falta ? "−" : "+"}${formatMXN(Math.abs(corte.diferencia))}`}
            </p>
          </div>

          <div className="mt-4 space-y-1.5 text-sm">
            <Fila label="Fondo con el que abriste" valor={corte.fondo_inicial} />
            <Fila label="Efectivo recibido" valor={corte.ventas_efectivo} />
            <Fila label="Entradas de efectivo" valor={corte.entradas} />
            <Fila label="Retiros" valor={-corte.retiros} />
            <div className="border-t border-gray-100 pt-1.5">
              <Fila label="Debía haber en caja" valor={corte.esperado} fuerte />
              <Fila label="Contaste" valor={corte.declarado} fuerte />
            </div>
          </div>

          {corte.propinas > 0 && (
            <p className="text-[11.5px] text-gray-500 mt-2">
              Del efectivo recibido, {formatMXN(corte.propinas)} son propinas. Si las repartes al cerrar,
              regístralo como retiro para que la caja siga cuadrando.
            </p>
          )}

          {(corte.ventas_tarjeta > 0 || corte.ventas_transferencia > 0) && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">No pasó por el cajón</p>
              {corte.ventas_tarjeta > 0 && <Fila label="Tarjeta" valor={corte.ventas_tarjeta} />}
              {corte.ventas_transferencia > 0 && <Fila label="Transferencia" valor={corte.ventas_transferencia} />}
            </div>
          )}

          {corte.nota && <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">📝 {corte.nota}</p>}

          <p className="text-[11px] text-gray-400 mt-4 leading-snug">
            Sólo entra lo que cobraste dentro de Mercadito ({corte.cuentas} {corte.cuentas === 1 ? "cuenta" : "cuentas"}).
            Lo que cobraste por fuera no lo podemos ver, así que no cuenta como faltante.
          </p>

          <div className="flex gap-2 mt-4 print:hidden">
            <button onClick={() => window.print()} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-sm">🖨️ Imprimir</button>
            <button onClick={() => setCorte(null)} className="flex-1 bg-brand text-white py-2.5 rounded-xl font-bold text-sm">Listo</button>
          </div>
        </section>
      </div>
    );
  }

  const t = estado?.turno;

  // ── Caja cerrada: abrir turno ─────────────────────────────────────────
  if (!t) {
    return (
      <div className="space-y-4">
        <section className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-1">Abrir caja</h3>
          <p className="text-xs text-gray-500 mb-4 leading-snug">
            Empieza el turno diciendo con cuánto efectivo arrancas. Al cerrar vas a contar el cajón y
            Mercadito te dice si cuadra — sin enseñarte el número antes.
          </p>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la caja</label>
          <input
            value={nombreCaja}
            onChange={(e) => setNombreCaja(e.target.value)}
            placeholder="Caja principal"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand mb-3"
          />
          <label className="block text-xs font-medium text-gray-600 mb-1">Fondo de caja (el cambio con el que abres)</label>
          <input
            value={fondo}
            onChange={(e) => setFondo(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-lg font-bold tabular-nums outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <button
            onClick={abrir}
            disabled={ocupado}
            className="w-full mt-4 bg-brand text-white font-bold py-3 rounded-xl active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {ocupado ? "Abriendo…" : "Abrir caja"}
          </button>
        </section>

        {esDueno && <Historial historial={historial} onVer={verHistorial} />}
      </div>
    );
  }

  // ── Turno abierto ─────────────────────────────────────────────────────
  const movs = estado?.movimientos ?? [];
  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800">{t.caja}</h3>
            <p className="text-xs text-gray-400">
              Abierta {fecha(t.abierto_at)}{t.abierto_por_nombre ? ` por ${t.abierto_por_nombre}` : ""}
            </p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">ABIERTA</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Mini n={formatMXN(t.fondo_inicial)} label="fondo inicial" />
          <Mini n={formatMXN(estado?.entradas ?? 0)} label="entradas" />
          <Mini n={formatMXN(estado?.retiros ?? 0)} label="retiros" />
        </div>

        {/* El efectivo esperado NO se muestra aquí a propósito: es lo único que
            hace que el conteo del cierre sea honesto. */}
        <p className="text-[11px] text-gray-400 mt-3 leading-snug">
          El efectivo que llevas se te muestra hasta que cierres y cuentes el cajón. Así el corte
          sirve para algo.
        </p>

        <div className="flex gap-2 mt-4">
          <button onClick={() => { setMovTipo("entrada"); setError(null); }} className="flex-1 bg-emerald-50 text-emerald-700 py-2.5 rounded-xl font-bold text-sm">+ Entrada</button>
          <button onClick={() => { setMovTipo("retiro"); setError(null); }} className="flex-1 bg-red-50 text-red-700 py-2.5 rounded-xl font-bold text-sm">− Retiro / gasto</button>
        </div>

        {movTipo && (
          <div className="mt-3 border border-gray-200 rounded-2xl p-3 space-y-2">
            <p className="text-sm font-bold text-gray-800">
              {movTipo === "entrada" ? "¿Cuánto efectivo entró?" : "¿Cuánto sacaste y para qué?"}
            </p>
            <input
              value={movMonto}
              onChange={(e) => setMovMonto(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base font-bold tabular-nums outline-none focus:border-brand"
            />
            <input
              value={movMotivo}
              onChange={(e) => setMovMotivo(e.target.value)}
              maxLength={120}
              placeholder={movTipo === "entrada" ? "Motivo (opcional)" : "Compra de insumos, pago a proveedor…"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setMovTipo(null); setError(null); }} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={registrarMov} disabled={ocupado} className="flex-1 bg-brand text-white py-2 rounded-xl font-bold text-sm disabled:opacity-60">Registrar</button>
            </div>
          </div>
        )}
      </section>

      {movs.length > 0 && (
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Movimientos del turno</h4>
          <div className="space-y-2">
            {movs.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-700">{m.motivo || (m.tipo === "entrada" ? "Entrada de efectivo" : "Retiro")}</p>
                  <p className="text-[11px] text-gray-400">
                    {m.usuario_nombre ? `${m.usuario_nombre} · ` : ""}{fecha(m.created_at)}
                  </p>
                </div>
                <span className={`font-bold tabular-nums whitespace-nowrap ${m.tipo === "entrada" ? "text-emerald-700" : "text-red-600"}`}>
                  {m.tipo === "entrada" ? "+" : "−"}{formatMXN(m.monto)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl p-5 shadow-sm">
        {!cerrando ? (
          <button onClick={() => { setCerrando(true); setError(null); }} className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl active:scale-[0.99] transition-transform">
            Cerrar caja y hacer el corte
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <h3 className="font-bold text-gray-800">Cuenta el cajón</h3>
              <p className="text-xs text-gray-500 leading-snug mt-0.5">
                Escribe cuánto efectivo hay <span className="font-semibold">de verdad</span>, contando el fondo.
                Al guardar te decimos si cuadra.
              </p>
            </div>
            <input
              value={declarado}
              onChange={(e) => setDeclarado(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              autoFocus
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-2xl font-extrabold tabular-nums outline-none focus:border-brand"
            />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">¿Cuánto dejas de fondo para el siguiente turno?</label>
              <input
                value={fondoSiguiente}
                onChange={(e) => setFondoSiguiente(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold tabular-nums outline-none focus:border-brand"
              />
            </div>
            <input
              value={notaCierre}
              onChange={(e) => setNotaCierre(e.target.value)}
              maxLength={200}
              placeholder="Nota del turno (opcional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setCerrando(false); setError(null); }} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={cerrar} disabled={ocupado || !declarado} className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50">
                {ocupado ? "Cerrando…" : "Cerrar y comparar"}
              </button>
            </div>
          </div>
        )}
      </section>

      {esDueno && <Historial historial={historial} onVer={verHistorial} />}
    </div>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "font-bold text-gray-900" : "text-gray-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{valor < 0 ? `−${formatMXN(Math.abs(valor))}` : formatMXN(valor)}</span>
    </div>
  );
}

function Mini({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[15px] font-extrabold text-gray-800 tabular-nums leading-tight">{n}</p>
      <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

/** Cortes pasados. Sólo el dueño: un cajero que puede revisarlos sabe cuánto
 *  puede faltar sin que se note. */
function Historial({ historial, onVer }: { historial: CorteHistorial[] | null; onVer: () => void }) {
  if (historial === null) {
    return (
      <button onClick={onVer} className="w-full bg-white rounded-2xl py-3 shadow-sm text-sm font-bold text-gray-600">
        Ver cortes anteriores
      </button>
    );
  }
  if (historial.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-6">Todavía no has cerrado ningún corte.</p>;
  }
  return (
    <section className="bg-white rounded-2xl p-4 shadow-sm">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Cortes anteriores</h4>
      <div className="space-y-2.5">
        {historial.map((c) => {
          const dif = c.diferencia ?? 0;
          const cuadra = Math.abs(dif) < 0.01;
          return (
            <div key={c.id} className="flex items-start justify-between gap-3 border-b border-gray-50 pb-2.5 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 font-semibold truncate">{c.caja}</p>
                <p className="text-[11px] text-gray-400">
                  {fecha(c.cerrado_at)}{c.cerrado_por_nombre ? ` · ${c.cerrado_por_nombre}` : ""}
                </p>
                {c.nota && <p className="text-[11px] text-gray-500 italic truncate">“{c.nota}”</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold tabular-nums ${cuadra ? "text-emerald-700" : dif < 0 ? "text-red-600" : "text-amber-700"}`}>
                  {cuadra ? "Cuadró" : `${dif < 0 ? "−" : "+"}${formatMXN(Math.abs(dif))}`}
                </p>
                <p className="text-[10px] text-gray-400 tabular-nums">
                  contó {c.declarado != null ? formatMXN(c.declarado) : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
