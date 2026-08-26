"use client";
import { useEffect, useState } from "react";

interface TicketItem {
  id: string;
  producto_nombre: string;
  cantidad: number;
  subtotal: number;
  // Presentación (sabor/tamaño) y extras: van en el recibo para que el
  // cliente reconozca lo que pidió y no reclame el precio.
  variante_nombre?: string | null;
  modificadores?: { modificador_nombre?: string; opcion_nombre?: string; nombre?: string }[] | null;
  /** Indicación del comensal. Va en el recibo por la misma razón que los
   *  extras: para que reconozca lo que pidió. */
  notas?: string | null;
}

interface Props {
  negocioNombre?: string;
  etiqueta: string; // mesa
  items: TicketItem[];
  total: number;
  metodo?: string;
  onClose: () => void;
}

// Ticket de cuenta imprimible para una mesa (estilo recibo térmico). Reusa el
// patrón de impresión de TicketPedido: el overlay tapa la página en print y los
// controles se ocultan.
export default function TicketCuenta({ negocioNombre, etiqueta, items, total, metodo, onClose }: Props) {
  const [dividir, setDividir] = useState(1);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const porPersona = total / Math.max(1, dividir);

  const fecha = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City",
  }).format(new Date());

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:block"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-sm w-full shadow-2xl print:shadow-none print:rounded-none print:max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 font-mono text-[13px] text-gray-800">
          <div className="text-center leading-tight">
            <div className="font-bold text-base">{negocioNombre || "Cuenta"}</div>
            <div className="text-gray-500">{etiqueta}</div>
            <div className="text-gray-500">{fecha}</div>
          </div>

          <div className="border-t border-dashed border-gray-400 my-3" />

          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-2">Sin productos aún.</div>
          ) : (
            items.map((it) => {
              const detalle = [it.variante_nombre, ...(it.modificadores ?? []).map((m) => m.opcion_nombre || m.nombre)]
                .filter(Boolean).join(" · ");
              return (
                <div key={it.id} className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 break-words">
                    {it.cantidad}× {it.producto_nombre}
                    {detalle && <span className="block text-[11px] text-gray-500">{detalle}</span>}
                    {it.notas && <span className="block text-[11px] text-gray-500 italic">“{it.notas}”</span>}
                  </span>
                  <span className="tabular-nums whitespace-nowrap">${Number(it.subtotal).toFixed(2)}</span>
                </div>
              );
            })
          )}

          <div className="border-t border-dashed border-gray-400 my-3" />

          <div className="flex justify-between font-bold text-base">
            <span>TOTAL</span>
            <span className="tabular-nums">${Number(total).toFixed(2)}</span>
          </div>
          {metodo && <div className="text-gray-500 mt-1">Pago: {metodo}</div>}

          {/* Dividir la cuenta (el control se oculta al imprimir; la línea sí sale). */}
          <div className="flex items-center justify-between mt-3 print:hidden">
            <span className="text-xs text-gray-600">Dividir entre</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setDividir(Math.max(1, dividir - 1))} disabled={dividir <= 1} aria-label="Menos" className="w-6 h-6 rounded-full bg-gray-100 font-bold leading-none disabled:opacity-40">−</button>
              <span className="w-5 text-center font-bold tabular-nums">{dividir}</span>
              <button onClick={() => setDividir(dividir + 1)} aria-label="Más" className="w-6 h-6 rounded-full bg-gray-100 font-bold leading-none">+</button>
            </div>
          </div>
          {dividir > 1 && (
            <div className="flex justify-between mt-1">
              <span>Entre {dividir}</span>
              <span className="tabular-nums">${porPersona.toFixed(2)} c/u</span>
            </div>
          )}

          <div className="text-center text-gray-500 mt-4">¡Gracias por su visita!</div>
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-100 print:hidden">
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg font-bold active:scale-95 transition-transform">Cerrar</button>
          <button onClick={() => window.print()} className="flex-1 bg-brand text-white py-2.5 rounded-lg font-bold active:scale-95 transition-transform">🖨️ Imprimir</button>
        </div>
      </div>
    </div>
  );
}
