import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IonName = ComponentProps<typeof Ionicons>["name"];

export const CATEGORIAS: Record<string, { nombre: string; icon: IonName }> = {
  frutas: { nombre: "Frutas", icon: "nutrition-outline" },
  verduras: { nombre: "Verduras", icon: "leaf-outline" },
  carnes: { nombre: "Carnes", icon: "restaurant-outline" },
  lacteos: { nombre: "Lácteos", icon: "water-outline" },
  cremeria: { nombre: "Cremería", icon: "water-outline" },
  abarrotes: { nombre: "Abarrotes", icon: "basket-outline" },
  granos: { nombre: "Granos", icon: "apps-outline" },
  restaurante: { nombre: "Restaurante", icon: "restaurant-outline" },
  botanero: { nombre: "Botanero", icon: "wine-outline" },
  cafeteria: { nombre: "Cafetería", icon: "cafe-outline" },
  comidas: { nombre: "Comidas", icon: "fast-food-outline" },
  antojitos: { nombre: "Antojitos", icon: "fast-food-outline" },
  panaderia: { nombre: "Panadería", icon: "pizza-outline" },
  bebidas: { nombre: "Bebidas", icon: "beer-outline" },
  farmacia: { nombre: "Farmacia", icon: "medical-outline" },
  limpieza: { nombre: "Limpieza", icon: "sparkles-outline" },
  mascotas: { nombre: "Mascotas", icon: "paw-outline" },
  ropa: { nombre: "Ropa", icon: "shirt-outline" },
  calzado: { nombre: "Calzado", icon: "footsteps-outline" },
  otro: { nombre: "Otro", icon: "ellipsis-horizontal-outline" },
};

export function catInfo(id: string): { nombre: string; icon: IonName } {
  return CATEGORIAS[id] ?? { nombre: id, icon: "ellipsis-horizontal-outline" };
}
