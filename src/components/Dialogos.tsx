"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Diálogos propios que reemplazan a `window.confirm`, `window.alert` y
 * `window.prompt`.
 *
 * El nativo se ve como una advertencia del navegador: antepone
 * "mercadito.cx dice" y ofrece "Aceptar / Cancelar" en gris. En una app
 * conversacional eso lee a error del sistema, no a pregunta del negocio.
 * Aquí controlamos tono (emoji + pregunta en corto), jerarquía (el botón
 * peligroso en rojo) y tipografía del design system.
 *
 * Se usan de forma imperativa para que migrar los call sites sea un
 * cambio de una línea, y devuelven lo mismo que su equivalente nativo:
 *
 *   if (!(await confirmar({ ... }))) return;      // boolean
 *   await avisar({ ... });                        // void
 *   const val = await preguntar({ ... });         // string | null
 *
 * Requiere <DialogosHost /> montado una vez (está en app/layout.tsx). Si
 * por lo que sea no está montado, caemos al diálogo nativo en vez de
 * quedarnos colgados esperando una promesa que nadie resuelve.
 */

export interface OpcionesConfirmar {
  /** Emoji grande arriba del título. Da el tono antes de leer. */
  emoji?: string;
  /** La pregunta, en corto. Es lo único que mucha gente lee. */
  titulo: string;
  /** Consecuencia o detalle. Opcional a propósito: si no aporta, se omite. */
  mensaje?: string;
  /** Texto del botón que confirma. Que diga qué va a pasar, no "Aceptar". */
  ok?: string;
  /** Texto del botón que cancela. */
  cancelar?: string;
  /** Pinta el botón de confirmar en rojo. Para lo que no se puede deshacer. */
  peligro?: boolean;
}

export interface OpcionesPreguntar extends Omit<OpcionesConfirmar, "peligro"> {
  /** Valor con el que arranca el campo (como el 2º argumento de `prompt`). */
  valor?: string;
  placeholder?: string;
  /**
   * `numero` y `pin` abren el teclado numérico en el celular. No usamos
   * `<input type="number">` porque en móvil deja meter `e`, `+` y `-`, y
   * las flechitas de desktop estorban más de lo que ayudan.
   */
  tipo?: "texto" | "numero" | "pin";
  /** Para respuestas largas (un motivo, una nota). Renderiza un textarea. */
  multilinea?: boolean;
  maxLength?: number;
}

type Respuesta = boolean | string | null;

interface Pendiente {
  /** Identidad del diálogo. Sirve de `key`: cada uno monta su campo limpio. */
  id: number;
  kind: "confirmar" | "avisar" | "preguntar";
  opts: OpcionesConfirmar & OpcionesPreguntar;
  resolver: (v: Respuesta) => void;
}

type Escucha = (p: Pendiente | null) => void;

let escucha: Escucha | null = null;
let seq = 0;
const cola: Pendiente[] = [];

function encolar(p: Omit<Pendiente, "id">) {
  const item = { ...p, id: ++seq };
  cola.push(item);
  if (cola.length === 1) escucha?.(item);
}

function siguiente() {
  cola.shift();
  escucha?.(cola[0] ?? null);
}

function textoPlano(o: { titulo: string; mensaje?: string }) {
  return [o.titulo, o.mensaje].filter(Boolean).join("\n\n");
}

/** Pregunta sí/no. Resuelve `true` solo si el usuario confirma. */
export function confirmar(opts: OpcionesConfirmar): Promise<boolean> {
  if (!escucha) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(window.confirm(textoPlano(opts)));
  }
  return new Promise<boolean>((res) =>
    encolar({ kind: "confirmar", opts, resolver: (v) => res(v === true) }),
  );
}

/** Aviso de un solo botón. Reemplaza a `alert`. */
export function avisar(opts: Omit<OpcionesConfirmar, "cancelar" | "peligro">): Promise<void> {
  if (!escucha) {
    if (typeof window !== "undefined") window.alert(textoPlano(opts));
    return Promise.resolve();
  }
  return new Promise<void>((res) => encolar({ kind: "avisar", opts, resolver: () => res() }));
}

/**
 * Pide un dato. Reemplaza a `prompt`: devuelve el texto, o `null` si el
 * usuario canceló — misma semántica, para que los call sites que ya hacían
 * `if (val === null) return` no cambien.
 */
export function preguntar(opts: OpcionesPreguntar): Promise<string | null> {
  if (!escucha) {
    if (typeof window === "undefined") return Promise.resolve(null);
    return Promise.resolve(window.prompt(textoPlano(opts), opts.valor ?? ""));
  }
  return new Promise<string | null>((res) =>
    encolar({ kind: "preguntar", opts, resolver: (v) => res(typeof v === "string" ? v : null) }),
  );
}

export function DialogosHost() {
  const [actual, setActual] = useState<Pendiente | null>(null);
  // El campo va sin estado: se lee del DOM al enviar. Así no hay que
  // sincronizar `valor` con el diálogo en turno desde un efecto.
  const campoRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    escucha = setActual;
    return () => { escucha = null; };
  }, []);

  const cerrar = useCallback((v: Respuesta) => {
    cola[0]?.resolver(v);
    siguiente();
  }, []);

  // Al montar el campo lo enfocamos y dejamos el texto seleccionado: casi
  // siempre se quiere reemplazar el valor que trae, no editarlo letra a letra.
  const enfocar = useCallback((n: HTMLInputElement | HTMLTextAreaElement | null) => {
    campoRef.current = n;
    if (n) { n.focus(); n.select(); }
  }, []);

  // Escape cancela, igual que tocar fuera. Y se bloquea el scroll del fondo
  // mientras el diálogo está abierto.
  useEffect(() => {
    if (!actual) return;
    const cancelado: Respuesta = actual.kind === "preguntar" ? null : false;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(cancelado); };
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [actual, cerrar]);

  if (!actual) return null;
  if (typeof document === "undefined") return null;

  const { kind, opts } = actual;
  const { emoji, titulo, mensaje, ok, cancelar, peligro } = opts;
  const esPregunta = kind === "preguntar";
  const conCancelar = kind !== "avisar";
  const cancelado: Respuesta = esPregunta ? null : false;
  const numerico = opts.tipo === "numero" || opts.tipo === "pin";

  // `text-base` (16px) a propósito: con menos, Safari en iPhone hace zoom al
  // enfocar el campo y descuadra el diálogo.
  const claseCampo =
    "w-full mt-4 rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 " +
    "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-soft";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => cerrar(cancelado)}
    >
      <form
        key={actual.id}
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-modal px-6 pt-6 pb-5 text-center outline-none"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); cerrar(esPregunta ? (campoRef.current?.value ?? "") : true); }}
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        // El foco entra a la tarjeta, no al botón de confirmar: si cayera ahí,
        // un Enter de inercia borraría sin leer. En las preguntas lo toma el
        // campo, que es donde se espera escribir.
        tabIndex={-1}
        ref={(n) => { if (!esPregunta) n?.focus(); }}
      >
        {emoji && <div className="text-4xl mb-3 leading-none">{emoji}</div>}
        <h2 className="font-bold text-gray-900 text-lg leading-snug">{titulo}</h2>
        {mensaje && <p className="text-sm text-gray-500 mt-2 leading-relaxed whitespace-pre-line">{mensaje}</p>}

        {esPregunta && (opts.multilinea ? (
          <textarea
            ref={enfocar}
            defaultValue={opts.valor ?? ""}
            placeholder={opts.placeholder}
            maxLength={opts.maxLength}
            rows={3}
            className={claseCampo + " text-left resize-none"}
          />
        ) : (
          <input
            ref={enfocar}
            defaultValue={opts.valor ?? ""}
            placeholder={opts.placeholder}
            maxLength={opts.maxLength ?? (opts.tipo === "pin" ? 6 : undefined)}
            type="text"
            inputMode={numerico ? "numeric" : "text"}
            autoComplete="off"
            className={claseCampo + " text-center"}
          />
        ))}

        {/* Botones apilados: en móvil una fila los aprieta y el texto largo
            ("Sí, borrar todo") se corta. El de confirmar va arriba. */}
        <div className="flex flex-col gap-2 mt-5">
          <button
            type="submit"
            className={`w-full rounded-xl py-3 font-semibold text-white transition-soft ${
              peligro ? "bg-danger hover:bg-danger-dark" : "bg-brand hover:bg-brand-dark"
            }`}
          >
            {ok ?? (esPregunta ? "Guardar" : conCancelar ? "Sí, continuar" : "Entendido")}
          </button>
          {conCancelar && (
            <button
              type="button"
              onClick={() => cerrar(cancelado)}
              className="w-full rounded-xl py-3 font-semibold text-gray-600 hover:bg-gray-100 transition-soft"
            >
              {cancelar ?? (esPregunta ? "Cancelar" : "Mejor no")}
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
