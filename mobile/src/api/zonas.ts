// Zonas de entrega. Coinciden con las que siembra el backend en db.ts.
// Si el backend agrega más zonas, hay que actualizar esta lista.
export interface Zona {
  id: string;
  nombre: string;
  costo: number;
  tiempo: string;
}

export const ZONAS: Zona[] = [
  { id: "sahuayo-centro", nombre: "Sahuayo - Centro", costo: 25, tiempo: "30-45 min" },
  { id: "sahuayo-colonias", nombre: "Sahuayo - Colonias", costo: 35, tiempo: "45-60 min" },
  { id: "jiquilpan", nombre: "Jiquilpan", costo: 50, tiempo: "60-90 min" },
  { id: "venustiano", nombre: "Venustiano Carranza", costo: 55, tiempo: "60-90 min" },
];
