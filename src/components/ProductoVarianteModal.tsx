"use client";

// Modal para elegir variante y/o modificadores antes de agregar al carrito.
// Se abre cuando un producto tiene opciones (variantes) o modificadores
// definidos. Si solo tiene modificadores, el selector de variante se oculta.

import { useMemo, useState } from "react";
import type { ProductoConPrecios } from "@/lib/types";
import {
  calcularPrecioEfectivo,
  sumarExtrasDeVariante,
  validarSeleccion,
  type ProductoVariante,
  type SeleccionModificador,
} from "@/lib/variantes";
import { unidadFormato } from "@/lib/categorias";

interface Props {
  producto: ProductoConPrecios;
  precio: ProductoConPrecios["precios"][number];
  onClose: () => void;
  onAgregar: (args: {
    variante: ProductoVariante | null;
    modificadores: SeleccionModificador[];
    cantidadInicial: number;
    montoSolicitado?: number | null;
  }) => void;
  // Si vienen valores iniciales, el modal arranca en modo edición:
  // botón final dice "Guardar cambios" en vez de "Agregar al carrito".
  inicial?: {
    cantidad: number;
    monto: number | null;
  } | null;
}

export default function ProductoVarianteModal({ producto, precio, onClose, onAgregar, inicial }: Props) {
  const opciones = producto.opciones ?? [];
  const variantes = producto.variantes ?? [];
  const modificadores = producto.modificadores ?? [];

  const permiteFraccion = !!producto.permite_fraccion && opciones.length === 0;
  const permitePorDinero = !!producto.permite_por_dinero && opciones.length === 0;
  const stepFraccion = 0.5;

  // Valor seleccionado por cada opción (mapa opcion_id -> valor_id).
  const [valoresElegidos, setValoresElegidos] = useState<Record<string, string>>({});
  // Opciones de modificador seleccionadas (array plano).
  const [modsElegidos, setModsElegidos] = useState<SeleccionModificador[]>([]);
  // En edición: arranca con cantidad/monto del item existente. En agregar:
  // cantidad mínima (0.5 si fracción, 1 si entero).
  const [cantidad, setCantidad] = useState(
    inicial?.cantidad ?? (permiteFraccion ? stepFraccion : 1)
  );
  // Cantidad libre por monto: el cliente teclea pesos, calculamos kg.
  const [modo, setModo] = useState<"cantidad" | "monto">(() => {
    if (inicial?.monto != null) return "monto";
    return permitePorDinero && !permiteFraccion ? "monto" : "cantidad";
  });
  const [monto, setMonto] = useState<string>(
    inicial?.monto != null ? String(inicial.monto) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const esEdicion = inicial != null;

  // Resuelvo qué variante corresponde a los valores elegidos.
  const varianteActual: ProductoVariante | null = useMemo(() => {
    if (opciones.length === 0) return null;
    const seleccionados = Object.values(valoresElegidos);
    if (seleccionados.length !== opciones.length) return null;
    const set = new Set(seleccionados);
    return (
      variantes.find(
        (v) => v.valor_ids.length === seleccionados.length && v.valor_ids.every((id) => set.has(id))
      ) ?? null
    );
  }, [opciones, variantes, valoresElegidos]);

  const extrasValores = useMemo(
    () => sumarExtrasDeVariante(opciones, varianteActual),
    [opciones, varianteActual]
  );

  const precioEfectivo = useMemo(() => {
    return calcularPrecioEfectivo(
      { precio: Number(precio.precio), precio_mayoreo: precio.precio_mayoreo ?? null, mayoreo_desde: precio.mayoreo_desde ?? null },
      varianteActual,
      modsElegidos,
      cantidad,
      extrasValores
    );
  }, [precio, varianteActual, modsElegidos, cantidad, extrasValores]);

  // Precio total que tendría el producto si eligieras este valor en este grupo,
  // manteniendo la selección actual de los otros grupos (o el primer valor de
  // cada grupo si aún no hay selección). Permite mostrar "Grande · $179" en
  // vez de "Grande +$30". Modificadores no se incluyen — esos se ven aparte.
  function precioTotalConValor(grupoId: string, valorId: string): number {
    const valIds: string[] = [];
    for (const op of opciones) {
      if (op.id === grupoId) valIds.push(valorId);
      else if (valoresElegidos[op.id]) valIds.push(valoresElegidos[op.id]);
      else if (op.valores.length > 0) valIds.push(op.valores[0].id);
    }
    const set = new Set(valIds);
    const variante = variantes.find(
      (v) => v.valor_ids.length === valIds.length && v.valor_ids.every((id) => set.has(id))
    ) ?? null;
    const base = Number(variante?.precio_override ?? precio.precio);
    let extras = 0;
    for (const op of opciones) {
      for (const vv of op.valores) {
        if (set.has(vv.id)) extras += Number(vv.precio_extra) || 0;
      }
    }
    return base + extras;
  }

  function toggleMod(m: { id: string; nombre: string; precio_extra: number }, grupo: { id: string; nombre: string; multiple: boolean }) {
    setModsElegidos((prev) => {
      const yaEsta = prev.find((p) => p.opcion_id === m.id);
      if (yaEsta) return prev.filter((p) => p.opcion_id !== m.id);
      let base = prev;
      if (!grupo.multiple) {
        // radio: quitar cualquier otra del mismo grupo
        base = prev.filter((p) => p.modificador_id !== grupo.id);
      }
      return [
        ...base,
        {
          modificador_id: grupo.id,
          modificador_nombre: grupo.nombre,
          opcion_id: m.id,
          opcion_nombre: m.nombre,
          precio_extra: Number(m.precio_extra) || 0,
        },
      ];
    });
  }

  // Cantidad final: si modo=monto, calcula desde el monto en pesos / precio base.
  const cantidadFinal = useMemo(() => {
    if (modo === "monto") {
      const m = parseFloat(monto);
      if (!isFinite(m) || m <= 0) return 0;
      const base = Number(precio.precio);
      if (base <= 0) return 0;
      return Math.round((m / base) * 1000) / 1000;
    }
    return cantidad;
  }, [modo, monto, cantidad, precio]);

  function confirmar() {
    setError(null);
    // Cada grupo de opciones debe tener selección — señalamos el primero faltante.
    for (const op of opciones) {
      if (!valoresElegidos[op.id]) {
        setError(`Elige una opción en "${op.nombre}"`);
        return;
      }
    }
    if (opciones.length > 0 && !varianteActual) {
      setError("Esa combinación no está disponible");
      return;
    }
    const err = validarSeleccion(modificadores, modsElegidos);
    if (err) { setError(err); return; }
    if (cantidadFinal <= 0) {
      setError(modo === "monto" ? "Escribe el monto en pesos" : "Elige una cantidad");
      return;
    }
    onAgregar({
      variante: varianteActual,
      modificadores: modsElegidos,
      cantidadInicial: cantidadFinal,
      montoSolicitado: modo === "monto" ? parseFloat(monto) || null : null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 truncate">{producto.nombre}</h3>
            <p className="text-xs text-gray-400">{precio.puesto_nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          {opciones.map((op) => (
            <div key={op.id}>
              <p className="text-sm font-bold text-gray-700 mb-2">
                {op.nombre}
                <span className="text-red-500 text-xs ml-1">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {op.valores.map((v) => {
                  const elegido = valoresElegidos[op.id] === v.id;
                  const precioTotal = precioTotalConValor(op.id, v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setValoresElegidos((prev) => ({ ...prev, [op.id]: v.id }))}
                      className={`px-3 py-1.5 rounded-full text-sm border-2 ${
                        elegido ? "border-brand bg-brand-light text-brand-dark font-bold" : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <span>{v.valor}</span>
                      <span className={`ml-1.5 text-xs ${elegido ? "text-brand-dark" : "text-gray-500"}`}>
                        ${precioTotal.toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {modificadores.map((m) => {
            const elegidasEnEsteGrupo = modsElegidos.filter((x) => x.modificador_id === m.id).length;
            const min = m.minimo ?? null;
            const max = m.maximo ?? null;
            // Texto de ayuda: "Elige exactamente N" | "Elige al menos N" | "Máx N" | "Elige una"
            const reglaTxt = (() => {
              if (m.multiple && min != null && max != null && min === max) return `Elige ${min}`;
              if (m.multiple && min != null && max != null) return `Elige entre ${min} y ${max}`;
              if (m.multiple && min != null) return `Elige al menos ${min}`;
              if (m.multiple && max != null) return `Máx ${max}`;
              if (!m.multiple && m.obligatorio) return "Elige una";
              return null;
            })();
            const badgeColor =
              min != null && elegidasEnEsteGrupo < min ? "text-red-500"
              : max != null && elegidasEnEsteGrupo === max ? "text-green-600"
              : "text-gray-400";
            return (
            <div key={m.id}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-700">
                  {m.nombre}
                  {m.obligatorio && <span className="text-red-500 text-xs ml-1">*</span>}
                </p>
                {reglaTxt && (
                  <span className={`text-[11px] font-medium ${badgeColor}`}>
                    {m.multiple ? `${elegidasEnEsteGrupo}/${max ?? "∞"} · ${reglaTxt}` : reglaTxt}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {m.opciones.map((o) => {
                  const elegido = modsElegidos.some((x) => x.opcion_id === o.id);
                  const bloqueado = !elegido && m.multiple && max != null && elegidasEnEsteGrupo >= max;
                  return (
                    <button
                      key={o.id}
                      disabled={bloqueado}
                      onClick={() => toggleMod(o, m)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-opacity ${
                        elegido ? "border-brand bg-brand-light"
                        : bloqueado ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                        : "border-gray-200 bg-white"
                      }`}
                    >
                      <span className={`text-sm ${elegido ? "font-bold text-brand-dark" : "text-gray-700"}`}>{o.nombre}</span>
                      <span className="text-xs text-gray-500">
                        {Number(o.precio_extra) > 0 ? `+$${Number(o.precio_extra).toFixed(2)}` : "Incluido"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}

          {permitePorDinero && (
            <div className="flex items-center justify-center bg-gray-100 rounded-full p-0.5 w-full">
              <button
                onClick={() => setModo("cantidad")}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${modo === "cantidad" ? "bg-white text-brand-dark shadow-sm" : "text-gray-500"}`}
              >Por {unidadFormato(producto.unidad, 1)}</button>
              <button
                onClick={() => setModo("monto")}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${modo === "monto" ? "bg-white text-brand-dark shadow-sm" : "text-gray-500"}`}
              >Por monto $</button>
            </div>
          )}

          <div className="bg-brand-light/40 rounded-2xl p-4 text-center">
            {(permiteFraccion || permitePorDinero) && opciones.length === 0 && (
              <p className="text-xs text-gray-500 mb-3">
                {unidadFormato(producto.unidad, 1).charAt(0).toUpperCase() + unidadFormato(producto.unidad, 1).slice(1)} cuesta{" "}
                <span className="font-bold text-gray-700">${Number(precio.precio).toFixed(2)}</span>
              </p>
            )}

            {modo === "monto" ? (
              <>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-3xl font-bold text-gray-400">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="w-32 text-4xl font-bold text-gray-800 text-center outline-none bg-transparent"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  ≈ {(() => {
                    const m = parseFloat(monto);
                    if (!isFinite(m) || m <= 0) return "0";
                    const base = Number(precio.precio);
                    return (m / base).toFixed(base >= 50 ? 3 : 2);
                  })()} {unidadFormato(producto.unidad, parseFloat(monto) / Number(precio.precio) || 1)}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-5">
                  <button
                    onClick={() => setCantidad((c) => Math.max(permiteFraccion ? stepFraccion : 1, +(c - (permiteFraccion ? stepFraccion : 1)).toFixed(2)))}
                    className="w-11 h-11 bg-red-100 text-red-600 rounded-full font-bold text-2xl active:scale-95 transition-transform"
                  >−</button>
                  <div className="text-center min-w-[5rem]">
                    <span className="text-3xl font-bold text-gray-800">
                      {permiteFraccion ? cantidad.toFixed(cantidad % 1 === 0 ? 0 : 2) : cantidad}
                    </span>
                    <p className="text-xs text-gray-500">{unidadFormato(producto.unidad, cantidad)}</p>
                  </div>
                  <button
                    onClick={() => setCantidad((c) => +(c + (permiteFraccion ? stepFraccion : 1)).toFixed(2))}
                    className="w-11 h-11 bg-green-100 text-green-700 rounded-full font-bold text-2xl active:scale-95 transition-transform"
                  >+</button>
                </div>
                <p className="text-base font-bold text-brand-dark mt-3">
                  ${(precioEfectivo.precio_unitario * cantidad).toFixed(2)}
                </p>
              </>
            )}
          </div>

          {precioEfectivo.aplica_mayoreo && modo === "cantidad" && (
            <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 text-center">
              🎉 Precio de mayoreo aplicado
            </p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-4 py-3">
          <button
            onClick={confirmar}
            className="w-full bg-brand text-white py-3 rounded-full font-bold active:scale-95 transition-transform"
          >
            {esEdicion ? "Guardar cambios" : "Agregar al carrito"}
          </button>
        </div>
      </div>
    </div>
  );
}
