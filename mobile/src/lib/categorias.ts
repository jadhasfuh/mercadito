import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IonName = ComponentProps<typeof Ionicons>["name"];

// Mantener alineado con la tabla `categorias` de la DB (src/lib/db.ts).
// `lacteos` y `granos` ya no existen — lacteos fue fusionado en `cremeria`
// ("Lácteos y Cremería"), granos se descartó.
export const CATEGORIAS: Record<string, { nombre: string; icon: IonName }> = {
  frutas: { nombre: "Frutas", icon: "nutrition-outline" },
  verduras: { nombre: "Verduras", icon: "leaf-outline" },
  carnes: { nombre: "Carnes y Mariscos", icon: "restaurant-outline" },
  mariscos: { nombre: "Mariscos y Pescados", icon: "fish-outline" },
  cremeria: { nombre: "Lácteos y Cremería", icon: "water-outline" },
  abarrotes: { nombre: "Abarrotes", icon: "basket-outline" },
  restaurante: { nombre: "Restaurante", icon: "restaurant-outline" },
  cafeteria: { nombre: "Cafetería", icon: "cafe-outline" },
  botanero: { nombre: "Centro Botanero", icon: "wine-outline" },
  antojitos: { nombre: "Antojitos", icon: "fast-food-outline" },
  comida_rapida: { nombre: "Hamburguesas y Comida Rápida", icon: "fast-food-outline" },
  pizzas: { nombre: "Pizzas", icon: "pizza-outline" },
  comidas: { nombre: "Comidas Preparadas", icon: "fast-food-outline" },
  panaderia: { nombre: "Panadería", icon: "pizza-outline" },
  bebidas: { nombre: "Bebidas", icon: "beer-outline" },
  snacks: { nombre: "Snacks", icon: "fast-food-outline" },
  farmacia: { nombre: "Farmacia", icon: "medical-outline" },
  limpieza: { nombre: "Limpieza", icon: "sparkles-outline" },
  mascotas: { nombre: "Mascotas", icon: "paw-outline" },
  ropa: { nombre: "Ropa", icon: "shirt-outline" },
  calzado: { nombre: "Calzado", icon: "footsteps-outline" },
  otro: { nombre: "Otro", icon: "ellipsis-horizontal-outline" },
};

// Categorías del modo "Servicios" (negocios de citas). El id se usa solo para
// filtrar/etiquetar en la UI; los negocios reales vienen de /api/negocios.
export const CATEGORIAS_SERVICIOS: Record<string, { nombre: string; icon: IonName }> = {
  peluqueria: { nombre: "Peluquería", icon: "cut-outline" },
  barberia: { nombre: "Barbería", icon: "cut-outline" },
  unas: { nombre: "Uñas y Estética", icon: "hand-left-outline" },
  spa: { nombre: "Spa y Masajes", icon: "flower-outline" },
  dentista: { nombre: "Dentista", icon: "medkit-outline" },
  doctor: { nombre: "Consultorio Médico", icon: "medical-outline" },
  dermatologo: { nombre: "Dermatólogo", icon: "body-outline" },
  veterinaria: { nombre: "Veterinaria", icon: "paw-outline" },
  restaurante: { nombre: "Reservar mesa", icon: "restaurant-outline" },
  cafe: { nombre: "Reservar mesa", icon: "restaurant-outline" },
  otro_servicio: { nombre: "Otros Servicios", icon: "calendar-outline" },
};

export function catInfo(id: string): { nombre: string; icon: IonName } {
  if (CATEGORIAS[id]) return CATEGORIAS[id];
  // Fallback: si la categoría existe en BD pero no en el map, formateamos
  // el ID (snake_case → "Title Case") para no mostrar "comida_rapida" crudo.
  const nombre = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { nombre, icon: "pricetag-outline" };
}
