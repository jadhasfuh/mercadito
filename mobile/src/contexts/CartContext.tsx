import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { calcularComision } from "../lib/comision";
import type { Producto } from "../api/catalogo";

export interface CartItem {
  producto_id: string;
  producto_nombre: string;
  puesto_id: string;
  puesto_nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number; // precio REAL efectivo (base o mayoreo segun cantidad)
  precio_base: number;
  precio_mayoreo: number | null;
  mayoreo_desde: number | null;
  comision: number;        // por unidad, sobre el precio efectivo
}

interface CartContextValue {
  items: CartItem[];
  agregar: (prod: Producto, puestoId: string) => void;
  cambiarCantidad: (productoId: string, puestoId: string, delta: number) => void;
  vaciar: () => void;
  subtotal: number;
  servicioMercadito: number;
  total: number;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  agregar: () => {},
  cambiarCantidad: () => {},
  vaciar: () => {},
  subtotal: 0,
  servicioMercadito: 0,
  total: 0,
});

function precioEfectivo(precio_base: number, precio_mayoreo: number | null, mayoreo_desde: number | null, cantidad: number): number {
  if (precio_mayoreo != null && mayoreo_desde != null && cantidad >= mayoreo_desde) {
    return precio_mayoreo;
  }
  return precio_base;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const agregar = useCallback((prod: Producto, puestoId: string) => {
    const precioInfo = prod.precios.find((p) => p.puesto_id === puestoId);
    if (!precioInfo) return;
    const base = Number(precioInfo.precio);
    const pm = precioInfo.precio_mayoreo != null ? Number(precioInfo.precio_mayoreo) : null;
    const md = precioInfo.mayoreo_desde != null ? Number(precioInfo.mayoreo_desde) : null;
    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === prod.id && i.puesto_id === puestoId);
      if (existing) {
        const nuevaCantidad = existing.cantidad + 1;
        const efectivo = precioEfectivo(existing.precio_base, existing.precio_mayoreo, existing.mayoreo_desde, nuevaCantidad);
        return prev.map((i) =>
          i.producto_id === prod.id && i.puesto_id === puestoId
            ? { ...i, cantidad: nuevaCantidad, precio_unitario: efectivo, comision: calcularComision(efectivo) }
            : i
        );
      }
      const efectivo = precioEfectivo(base, pm, md, 1);
      return [
        ...prev,
        {
          producto_id: prod.id,
          producto_nombre: prod.nombre,
          puesto_id: puestoId,
          puesto_nombre: precioInfo.puesto_nombre,
          unidad: prod.unidad,
          cantidad: 1,
          precio_unitario: efectivo,
          precio_base: base,
          precio_mayoreo: pm,
          mayoreo_desde: md,
          comision: calcularComision(efectivo),
        },
      ];
    });
  }, []);

  const cambiarCantidad = useCallback((productoId: string, puestoId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.producto_id === productoId && i.puesto_id === puestoId) {
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

  const { subtotal, servicioMercadito, total } = useMemo(() => {
    const sub = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    const serv = items.reduce((s, i) => s + i.cantidad * i.comision, 0);
    return { subtotal: sub, servicioMercadito: serv, total: sub + serv };
  }, [items]);

  return (
    <CartContext.Provider value={{ items, agregar, cambiarCantidad, vaciar, subtotal, servicioMercadito, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
