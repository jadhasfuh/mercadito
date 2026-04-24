"use client";

// Editor de variantes (opciones) y modificadores para productos.
// Diseño inspirado en Shopify + Uber Eats + Mercado Libre:
//  - cards grandes con sombra suave
//  - switches en vez de checkboxes
//  - opciones en línea con inputs cómodos
//  - templates rápidos de 1 click para casos comunes
//  - jerarquía visual clara, mobile-first

// ─────────── Tipos de edición ───────────
export interface OpcionEdit {
  id: string;
  nombre: string;
  valores: { id: string; valor: string; precio_extra: string }[];
}

export interface ModificadorEdit {
  id: string;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  maximo: string;
  minimo: string;
  opciones: { id: string; nombre: string; precio_extra: string }[];
}

function tempId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─────────── Templates (quickstart) ───────────
type Template<T> = { titulo: string; icono: string; build: () => T };

const TEMPLATES_OPCIONES: Template<OpcionEdit>[] = [
  {
    titulo: "Carne para tacos",
    icono: "🌮",
    build: () => ({
      id: tempId(),
      nombre: "Carne",
      valores: [
        { id: tempId(), valor: "Pastor", precio_extra: "" },
        { id: tempId(), valor: "Suadero", precio_extra: "" },
        { id: tempId(), valor: "Bistec", precio_extra: "" },
        { id: tempId(), valor: "Arrachera", precio_extra: "15" },
      ],
    }),
  },
  {
    titulo: "Tamaño bebida",
    icono: "🥤",
    build: () => ({
      id: tempId(),
      nombre: "Tamaño",
      valores: [
        { id: tempId(), valor: "Chico", precio_extra: "" },
        { id: tempId(), valor: "Mediano", precio_extra: "10" },
        { id: tempId(), valor: "Grande", precio_extra: "20" },
      ],
    }),
  },
  {
    titulo: "Talla ropa",
    icono: "👕",
    build: () => ({
      id: tempId(),
      nombre: "Talla",
      valores: [
        { id: tempId(), valor: "CH", precio_extra: "" },
        { id: tempId(), valor: "M", precio_extra: "" },
        { id: tempId(), valor: "G", precio_extra: "" },
        { id: tempId(), valor: "XG", precio_extra: "" },
      ],
    }),
  },
  {
    titulo: "Color básico",
    icono: "🎨",
    build: () => ({
      id: tempId(),
      nombre: "Color",
      valores: [
        { id: tempId(), valor: "Negro", precio_extra: "" },
        { id: tempId(), valor: "Blanco", precio_extra: "" },
        { id: tempId(), valor: "Rojo", precio_extra: "" },
        { id: tempId(), valor: "Azul", precio_extra: "" },
      ],
    }),
  },
];

const TEMPLATES_MODIFICADORES: Template<ModificadorEdit>[] = [
  {
    titulo: "Salsas",
    icono: "🌶️",
    build: () => ({
      id: tempId(),
      nombre: "Salsa",
      obligatorio: true,
      multiple: false,
      maximo: "",
      minimo: "",
      opciones: [
        { id: tempId(), nombre: "Verde", precio_extra: "" },
        { id: tempId(), nombre: "Roja", precio_extra: "" },
        { id: tempId(), nombre: "Picante", precio_extra: "" },
      ],
    }),
  },
  {
    titulo: "Extras pizza",
    icono: "🍕",
    build: () => ({
      id: tempId(),
      nombre: "Extras",
      obligatorio: false,
      multiple: true,
      maximo: "3",
      minimo: "",
      opciones: [
        { id: tempId(), nombre: "Queso extra", precio_extra: "15" },
        { id: tempId(), nombre: "Pepperoni", precio_extra: "20" },
        { id: tempId(), nombre: "Champiñón", precio_extra: "10" },
      ],
    }),
  },
  {
    titulo: "Ingredientes",
    icono: "🥬",
    build: () => ({
      id: tempId(),
      nombre: "Ingredientes",
      obligatorio: false,
      multiple: true,
      maximo: "",
      minimo: "",
      opciones: [
        { id: tempId(), nombre: "Cebolla", precio_extra: "" },
        { id: tempId(), nombre: "Cilantro", precio_extra: "" },
        { id: tempId(), nombre: "Aguacate", precio_extra: "10" },
        { id: tempId(), nombre: "Queso", precio_extra: "8" },
      ],
    }),
  },
];

// ─────────── Switch (reutilizable) ───────────
function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none">
      <div className="min-w-0">
        <span className="text-sm font-medium text-gray-700 block">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${on ? "bg-brand" : "bg-gray-300"}`}
        aria-pressed={on}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

// ─────────── Chips de templates ───────────
function Plantillas<T>({ items, onUse }: { items: Template<T>[]; onUse: (v: T) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-2 -mx-1 px-1">
      {items.map((t) => (
        <button
          key={t.titulo}
          type="button"
          onClick={() => onUse(t.build())}
          className="shrink-0 flex items-center gap-1.5 bg-white border-2 border-dashed border-brand text-brand-dark px-3 py-1.5 rounded-full text-xs font-medium hover:bg-brand-light active:scale-95 transition-all"
        >
          <span>{t.icono}</span>
          <span>{t.titulo}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── VariantesEditor ───────────────────────────
// `precioBase` se usa para presentar al dueño los valores en **precio total**
// (ej "Chica $110") en lugar de "+$40". Internamente seguimos guardando
// precio_extra (= total − base). Si no se pasa, usamos modo clásico "+$".
export function VariantesEditor({
  opciones,
  onOpcionesChange,
  productoNombre,
  precioBase,
}: {
  opciones: OpcionEdit[];
  onOpcionesChange: (v: OpcionEdit[]) => void;
  productoNombre?: string;
  precioBase?: number;
}) {
  const refProd = productoNombre?.trim() || "producto";
  const base = Number(precioBase) || 0;
  const modoTotal = base > 0;

  // Convierte el string que el dueño escribe (precio total) al string de
  // precio_extra que se guarda. Si escribe vacío, devolvemos vacío.
  function onPrecioInput(raw: string): string {
    if (!raw.trim()) return "";
    if (!modoTotal) return raw; // modo clásico: lo que escribe es el extra
    const n = Number(raw);
    if (!isFinite(n)) return raw;
    const extra = n - base;
    return String(extra);
  }

  // Muestra precio_extra como total (base + extra) al renderizar el input.
  function extraADisplay(extraStr: string): string {
    if (!extraStr.trim()) return modoTotal ? "" : "";
    const ex = Number(extraStr);
    if (!isFinite(ex)) return extraStr;
    if (!modoTotal) return extraStr;
    return String(base + ex);
  }

  function agregarGrupo() {
    onOpcionesChange([
      ...opciones,
      { id: tempId(), nombre: "", valores: [{ id: tempId(), valor: "", precio_extra: "" }] },
    ]);
  }

  return (
    <section className="mt-4">
      <header className="mb-2">
        <h3 className="text-base font-bold text-gray-800">Opciones</h3>
        <p className="text-xs text-gray-500">
          Variantes del producto (color, talla, sabor...). El cliente elige una de cada grupo.
          {modoTotal && (
            <> <br />Pon el <strong>precio total</strong> de cada opción. El sistema calcula la diferencia contra el precio base (${base.toFixed(2)}).</>
          )}
        </p>
      </header>

      {opciones.length === 0 && (
        <Plantillas<OpcionEdit> items={TEMPLATES_OPCIONES} onUse={(v) => onOpcionesChange([...opciones, v])} />
      )}

      <div className="space-y-3">
        {opciones.map((op, i) => (
          <div key={op.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                className="flex-1 min-w-0 border-0 border-b-2 border-gray-200 focus:border-brand outline-none text-base font-bold text-gray-800 pb-1"
                placeholder="Nombre del grupo (ej: Color)"
                value={op.nombre}
                onChange={(e) => {
                  const next = [...opciones];
                  next[i] = { ...op, nombre: e.target.value };
                  onOpcionesChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onOpcionesChange(opciones.filter((_, j) => j !== i))}
                className="shrink-0 w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-lg"
                aria-label="Eliminar grupo"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              {op.valores.map((v, j) => {
                const extra = Number(v.precio_extra) || 0;
                const precioTotal = modoTotal ? base + extra : extra;
                return (
                  <div key={v.id}>
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand focus:bg-white outline-none"
                        placeholder="Ej: Rojo"
                        value={v.valor}
                        onChange={(e) => {
                          const next = [...opciones];
                          next[i] = {
                            ...op,
                            valores: op.valores.map((x, k) => (k === j ? { ...x, valor: e.target.value } : x)),
                          };
                          onOpcionesChange(next);
                        }}
                      />
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          className="w-24 bg-gray-50 border border-gray-200 rounded-lg pl-5 pr-2 py-2 text-sm focus:border-brand focus:bg-white outline-none"
                          placeholder={modoTotal ? String(base) : "0"}
                          type="number"
                          inputMode="decimal"
                          value={modoTotal ? (extra === 0 && !v.precio_extra ? "" : String(base + extra)) : v.precio_extra}
                          onChange={(e) => {
                            const next = [...opciones];
                            next[i] = {
                              ...op,
                              valores: op.valores.map((x, k) => (k === j ? { ...x, precio_extra: onPrecioInput(e.target.value) } : x)),
                            };
                            onOpcionesChange(next);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...opciones];
                          next[i] = { ...op, valores: op.valores.filter((_, k) => k !== j) };
                          onOpcionesChange(next);
                        }}
                        className="shrink-0 w-8 h-8 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-lg"
                        aria-label="Quitar valor"
                      >
                        ×
                      </button>
                    </div>
                    {modoTotal && extra > 0 && (
                      <p className="text-[11px] text-gray-500 mt-1 ml-1">
                        +${extra.toFixed(2)} respecto al precio base de <span className="font-semibold">{refProd}</span> (${base.toFixed(2)})
                      </p>
                    )}
                    {!modoTotal && extra > 0 && (
                      <p className="text-[11px] text-gray-500 mt-1 ml-1">
                        Se sumará ${extra.toFixed(2)} al precio de <span className="font-semibold">{refProd}</span>
                      </p>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const next = [...opciones];
                  next[i] = {
                    ...op,
                    valores: [...op.valores, { id: tempId(), valor: "", precio_extra: "" }],
                  };
                  onOpcionesChange(next);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand-dark transition-colors"
              >
                + Agregar opción
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={agregarGrupo}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-brand text-brand-dark rounded-2xl font-medium hover:bg-brand-light transition-colors"
        >
          <span className="text-lg leading-none">＋</span>
          <span>Agregar grupo de opciones</span>
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────── ModificadoresEditor ───────────────────────────
export function ModificadoresEditor({
  value,
  onChange,
  productoNombre,
}: {
  value: ModificadorEdit[];
  onChange: (v: ModificadorEdit[]) => void;
  productoNombre?: string;
}) {
  const refProd = productoNombre?.trim() || "producto";

  function agregarGrupo() {
    onChange([
      ...value,
      {
        id: tempId(),
        nombre: "",
        obligatorio: false,
        multiple: false,
        maximo: "",
        minimo: "",
        opciones: [{ id: tempId(), nombre: "", precio_extra: "" }],
      },
    ]);
  }

  return (
    <section className="mt-4">
      <header className="mb-2">
        <h3 className="text-base font-bold text-gray-800">Modificadores</h3>
        <p className="text-xs text-gray-500">Extras, salsas e ingredientes que el cliente puede agregar.</p>
      </header>

      {value.length === 0 && (
        <Plantillas<ModificadorEdit> items={TEMPLATES_MODIFICADORES} onUse={(v) => onChange([...value, v])} />
      )}

      <div className="space-y-3">
        {value.map((m, i) => (
          <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <input
                className="flex-1 min-w-0 border-0 border-b-2 border-gray-200 focus:border-brand outline-none text-base font-bold text-gray-800 pb-1"
                placeholder="Nombre del grupo (ej: Salsa)"
                value={m.nombre}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = { ...m, nombre: e.target.value };
                  onChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-lg"
                aria-label="Eliminar grupo"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-0 -mx-1 px-1 py-1 border-y border-gray-100 mb-3">
              <Switch
                on={m.obligatorio}
                label="Obligatorio"
                hint="El cliente debe elegir al menos una opción"
                onChange={(v) => {
                  const next = [...value];
                  next[i] = { ...m, obligatorio: v };
                  onChange(next);
                }}
              />
              <Switch
                on={m.multiple}
                label="Permitir varias"
                hint={m.multiple ? "Puede elegir varias opciones" : "Solo una opción a la vez"}
                onChange={(v) => {
                  const next = [...value];
                  next[i] = { ...m, multiple: v };
                  onChange(next);
                }}
              />
              {m.multiple && (
                <>
                  <div className="flex items-center justify-between py-2 gap-3">
                    <div>
                      <span className="text-sm text-gray-700 block">Mínimo a elegir</span>
                      <span className="text-[11px] text-gray-400">Deja vacío para que sea opcional</span>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={m.minimo}
                      onChange={(e) => {
                        const next = [...value];
                        next[i] = { ...m, minimo: e.target.value };
                        onChange(next);
                      }}
                      placeholder="—"
                      className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-brand outline-none text-right"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 gap-3">
                    <div>
                      <span className="text-sm text-gray-700 block">Máximo a elegir</span>
                      <span className="text-[11px] text-gray-400">Si mínimo = máximo, el cliente elige exactamente esa cantidad</span>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={m.maximo}
                      onChange={(e) => {
                        const next = [...value];
                        next[i] = { ...m, maximo: e.target.value };
                        onChange(next);
                      }}
                      placeholder="Sin límite"
                      className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-brand outline-none text-right"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              {m.opciones.map((o, j) => {
                const extra = Number(o.precio_extra) || 0;
                return (
                  <div key={o.id}>
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand focus:bg-white outline-none"
                        placeholder="Ej: Verde"
                        value={o.nombre}
                        onChange={(e) => {
                          const next = [...value];
                          const opciones = [...m.opciones];
                          opciones[j] = { ...o, nombre: e.target.value };
                          next[i] = { ...m, opciones };
                          onChange(next);
                        }}
                      />
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">+$</span>
                        <input
                          className="w-20 bg-gray-50 border border-gray-200 rounded-lg pl-6 pr-2 py-2 text-sm focus:border-brand focus:bg-white outline-none"
                          placeholder="0"
                          type="number"
                          inputMode="decimal"
                          value={o.precio_extra}
                          onChange={(e) => {
                            const next = [...value];
                            const opciones = [...m.opciones];
                            opciones[j] = { ...o, precio_extra: e.target.value };
                            next[i] = { ...m, opciones };
                            onChange(next);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...value];
                          next[i] = { ...m, opciones: m.opciones.filter((_, k) => k !== j) };
                          onChange(next);
                        }}
                        className="shrink-0 w-8 h-8 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-lg"
                        aria-label="Quitar opción"
                      >
                        ×
                      </button>
                    </div>
                    {extra > 0 && (
                      <p className="text-[11px] text-gray-500 mt-1 ml-1">
                        +${extra.toFixed(2)} al precio de <span className="font-semibold">{refProd}</span>
                      </p>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const next = [...value];
                  next[i] = {
                    ...m,
                    opciones: [...m.opciones, { id: tempId(), nombre: "", precio_extra: "" }],
                  };
                  onChange(next);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand-dark transition-colors"
              >
                + Agregar opción
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={agregarGrupo}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-brand text-brand-dark rounded-2xl font-medium hover:bg-brand-light transition-colors"
        >
          <span className="text-lg leading-none">＋</span>
          <span>Agregar grupo de modificadores</span>
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────── Validación ───────────────────────────
export function validarExtras(opciones: OpcionEdit[], modificadores: ModificadorEdit[]): string | null {
  for (const op of opciones) {
    if (!op.nombre.trim()) return "Ponle nombre a cada grupo de opciones (ej: Color, Talla).";
    if (op.valores.filter((v) => v.valor.trim()).length === 0) {
      return `El grupo "${op.nombre}" no tiene valores. Agrega al menos uno.`;
    }
  }
  for (const m of modificadores) {
    if (!m.nombre.trim()) return "Ponle nombre a cada grupo de modificadores.";
    if (m.opciones.filter((o) => o.nombre.trim()).length === 0) {
      return `El grupo "${m.nombre}" no tiene opciones. Agrega al menos una.`;
    }
  }
  return null;
}

// ─────────────────────────── Serializers ───────────────────────────
export function serializarOpciones(opciones: OpcionEdit[]) {
  return opciones
    .filter((op) => op.nombre.trim())
    .map((op, i) => ({
      id: op.id,
      nombre: op.nombre.trim(),
      orden: i,
      valores: op.valores
        .filter((v) => v.valor.trim())
        .map((v, j) => ({
          id: v.id,
          valor: v.valor.trim(),
          precio_extra: v.precio_extra ? Number(v.precio_extra) : 0,
          orden: j,
        })),
    }));
}

export function serializarModificadores(modificadores: ModificadorEdit[]) {
  return modificadores
    .filter((m) => m.nombre.trim())
    .map((m, i) => ({
      nombre: m.nombre.trim(),
      obligatorio: m.obligatorio,
      multiple: m.multiple,
      maximo: m.maximo ? Number(m.maximo) : null,
      minimo: m.minimo ? Number(m.minimo) : null,
      orden: i,
      opciones: m.opciones
        .filter((o) => o.nombre.trim())
        .map((o, j) => ({
          nombre: o.nombre.trim(),
          precio_extra: o.precio_extra ? Number(o.precio_extra) : 0,
          orden: j,
        })),
    }));
}

export function deserializarOpciones(
  opciones: { id: string; nombre: string; valores: { id: string; valor: string; precio_extra?: number | string | null }[] }[]
): OpcionEdit[] {
  return opciones.map((op) => ({
    id: op.id,
    nombre: op.nombre,
    valores: op.valores.map((v) => ({
      id: v.id,
      valor: v.valor,
      precio_extra: v.precio_extra != null && Number(v.precio_extra) !== 0 ? String(v.precio_extra) : "",
    })),
  }));
}

export function deserializarModificadores(
  modificadores: {
    id: string;
    nombre: string;
    obligatorio: boolean;
    multiple: boolean;
    maximo: number | null;
    minimo?: number | null;
    opciones: { id: string; nombre: string; precio_extra: number }[];
  }[]
): ModificadorEdit[] {
  return modificadores.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    obligatorio: m.obligatorio,
    multiple: m.multiple,
    maximo: m.maximo != null ? String(m.maximo) : "",
    minimo: m.minimo != null ? String(m.minimo) : "",
    opciones: m.opciones.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      precio_extra: o.precio_extra ? String(o.precio_extra) : "",
    })),
  }));
}
