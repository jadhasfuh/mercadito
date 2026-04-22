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
  precio_unitario: number; // precio REAL (sin comision)
  comision: number;        // comision por unidad
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const agregar = useCallback((prod: Producto, puestoId: string) => {
    const precioInfo = prod.precios.find((p) => p.puesto_id === puestoId);
    if (!precioInfo) return;
    const comision = calcularComision(precioInfo.precio);
    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === prod.id && i.puesto_id === puestoId);
      if (existing) {
        return prev.map((i) =>
          i.producto_id === prod.id && i.puesto_id === puestoId
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          producto_id: prod.id,
          producto_nombre: prod.nombre,
          puesto_id: puestoId,
          puesto_nombre: precioInfo.puesto_nombre,
          unidad: prod.unidad,
          cantidad: 1,
          precio_unitario: precioInfo.precio,
          comision,
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
            return n <= 0 ? null : { ...i, cantidad: n };
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
