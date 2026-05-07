import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { calcularComision } from "../lib/comision";
import type { Producto } from "../api/catalogo";
import { claveItemCarrito, sumarExtrasDeVariante, type ProductoVariante, type SeleccionModificador } from "../lib/variantes";

export interface CartItem {
  producto_id: string;
  producto_nombre: string;
  puesto_id: string;
  puesto_nombre: string;
  puesto_lat: number | null;
  puesto_lng: number | null;
  unidad: string;
  cantidad: number;
  precio_unitario: number; // precio REAL efectivo (base + extras, o mayoreo + extras)
  precio_base: number;     // base (sin mayoreo) con extras ya sumados
  precio_mayoreo: number | null; // mayoreo con extras ya sumados
  mayoreo_desde: number | null;
  comision: number;
  // Variantes y modificadores (opcionales).
  variante_id: string | null;
  variante_nombre: string | null;
  modificadores: SeleccionModificador[];
  // Cantidad libre por monto: si el cliente compró por pesos, guardamos el
  // monto exacto. cantidad y subtotal siguen siendo la fuente de verdad
  // para el checkout. null = item normal por cantidad.
  monto_solicitado: number | null;
  // Flags del producto al momento de agregar — usados en el carrito para
  // decidir si mostrar el botón "Editar" (que reabre el modal). Snapshot
  // intencional: si la tienda los desactiva después, los items ya en el
  // carrito siguen editables.
  permite_fraccion: boolean;
  permite_por_dinero: boolean;
}

interface CartContextValue {
  items: CartItem[];
  agregar: (
    prod: Producto,
    puestoId: string,
    seleccion?: {
      variante: ProductoVariante | null;
      modificadores: SeleccionModificador[];
      cantidadInicial?: number;
      montoSolicitado?: number | null;
    }
  ) => void;
  cambiarCantidad: (clave: string, delta: number) => void;
  /** Reemplaza la cantidad/monto de un ítem (edición desde el carrito). */
  actualizarItem: (clave: string, args: { cantidad: number; montoSolicitado: number | null }) => void;
  vaciar: () => void;
  subtotal: number;
  servicioMercadito: number;
  promocionMayoreo: number;
  total: number;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  agregar: () => {},
  cambiarCantidad: () => {},
  actualizarItem: () => {},
  vaciar: () => {},
  subtotal: 0,
  servicioMercadito: 0,
  promocionMayoreo: 0,
  total: 0,
});

function precioEfectivo(precio_base: number, precio_mayoreo: number | null, mayoreo_desde: number | null, cantidad: number): number {
  if (precio_mayoreo != null && mayoreo_desde != null && cantidad >= mayoreo_desde) {
    return precio_mayoreo;
  }
  return precio_base;
}

function keyOf(i: { producto_id: string; puesto_id: string; variante_id: string | null; modificadores: SeleccionModificador[] }) {
  return claveItemCarrito(i.producto_id, i.puesto_id, i.variante_id, i.modificadores);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const agregar = useCallback(
    (
      prod: Producto,
      puestoId: string,
      seleccion?: {
        variante: ProductoVariante | null;
        modificadores: SeleccionModificador[];
        cantidadInicial?: number;
        montoSolicitado?: number | null;
      }
    ) => {
      const precioInfo = prod.precios.find((p) => p.puesto_id === puestoId);
      if (!precioInfo) return;

      const variante = seleccion?.variante ?? null;
      const modificadores = seleccion?.modificadores ?? [];
      const cantInicial = seleccion?.cantidadInicial ?? 1;
      const montoSolic = seleccion?.montoSolicitado ?? null;

      const baseRaw = Number(variante?.precio_override ?? precioInfo.precio);
      const pmRaw =
        variante?.precio_mayoreo_override != null
          ? Number(variante.precio_mayoreo_override)
          : precioInfo.precio_mayoreo != null
          ? Number(precioInfo.precio_mayoreo)
          : null;
      const mdRaw =
        variante?.mayoreo_desde_override != null
          ? Number(variante.mayoreo_desde_override)
          : precioInfo.mayoreo_desde != null
          ? Number(precioInfo.mayoreo_desde)
          : null;

      const extrasMods = modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);
      const extrasVals = sumarExtrasDeVariante(prod.opciones ?? [], variante);
      const base = baseRaw + extrasVals + extrasMods;
      const pm = pmRaw != null ? pmRaw + extrasVals + extrasMods : null;
      const md = mdRaw;

      setItems((prev) => {
        const clave = claveItemCarrito(prod.id, puestoId, variante?.id ?? null, modificadores);
        const existing = prev.find((i) => keyOf(i) === clave);
        if (existing) {
          const nuevaCantidad = existing.cantidad + cantInicial;
          const efectivo = precioEfectivo(existing.precio_base, existing.precio_mayoreo, existing.mayoreo_desde, nuevaCantidad);
          return prev.map((i) =>
            keyOf(i) === clave
              ? { ...i, cantidad: nuevaCantidad, precio_unitario: efectivo, comision: calcularComision(efectivo) }
              : i
          );
        }
        const efectivo = precioEfectivo(base, pm, md, cantInicial);
        return [
          ...prev,
          {
            producto_id: prod.id,
            producto_nombre: prod.nombre,
            puesto_id: puestoId,
            puesto_nombre: precioInfo.puesto_nombre,
            puesto_lat: precioInfo.puesto_lat ?? null,
            puesto_lng: precioInfo.puesto_lng ?? null,
            unidad: prod.unidad,
            cantidad: cantInicial,
            precio_unitario: efectivo,
            precio_base: base,
            precio_mayoreo: pm,
            mayoreo_desde: md,
            comision: calcularComision(efectivo),
            variante_id: variante?.id ?? null,
            variante_nombre: variante?.nombre ?? null,
            modificadores,
            monto_solicitado: montoSolic,
            permite_fraccion: !!prod.permite_fraccion,
            permite_por_dinero: !!prod.permite_por_dinero,
          },
        ];
      });
    },
    []
  );

  const actualizarItem = useCallback((clave: string, args: { cantidad: number; montoSolicitado: number | null }) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (keyOf(i) !== clave) return i;
          if (args.cantidad <= 0) return null;
          // En modo monto: precio fijo a base (mayoreo se ignora — el cliente
          // pidió pagar exactamente $X). En modo cantidad: aplica mayoreo.
          const efectivo = args.montoSolicitado != null
            ? i.precio_base
            : precioEfectivo(i.precio_base, i.precio_mayoreo, i.mayoreo_desde, args.cantidad);
          return { ...i, cantidad: args.cantidad, precio_unitario: efectivo, comision: calcularComision(efectivo), monto_solicitado: args.montoSolicitado };
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const cambiarCantidad = useCallback((clave: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (keyOf(i) === clave) {
            const n = i.cantidad + delta;
            if (n <= 0) return null;
            const efectivo = precioEfectivo(i.precio_base, i.precio_mayoreo, i.mayoreo_desde, n);
            return { ...i, cantidad: n, precio_unitario: efectivo, comision: calcularComision(efectivo) };
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  const { subtotal, servicioMercadito, promocionMayoreo, total } = useMemo(() => {
    const sub = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    const serv = items.reduce((s, i) => s + i.cantidad * i.comision, 0);
    const promo = items.reduce((s, i) => {
      if (i.precio_mayoreo != null && i.mayoreo_desde != null && i.cantidad >= i.mayoreo_desde) {
        return s + (i.precio_base - i.precio_unitario) * i.cantidad;
      }
      return s;
    }, 0);
    return { subtotal: sub, servicioMercadito: serv, promocionMayoreo: promo, total: sub + serv };
  }, [items]);

  return (
    <CartContext.Provider value={{ items, agregar, cambiarCantidad, actualizarItem, vaciar, subtotal, servicioMercadito, promocionMayoreo, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
