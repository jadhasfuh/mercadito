export interface Unidad {
  id: string;
  nombre: string;
}

// Set genérico de unidades. Para una lógica más fina por categoría usar la web.
export const UNIDADES: Unidad[] = [
  { id: "pz", nombre: "Pieza" },
  { id: "kg", nombre: "Kilo" },
  { id: "g", nombre: "Gramo" },
  { id: "l", nombre: "Litro" },
  { id: "ml", nombre: "Mililitro" },
  { id: "paq", nombre: "Paquete" },
  { id: "caja", nombre: "Caja" },
  { id: "bolsa", nombre: "Bolsa" },
  { id: "manojo", nombre: "Manojo" },
  { id: "docena", nombre: "Docena" },
  { id: "orden", nombre: "Orden" },
  { id: "porcion", nombre: "Porción" },
  { id: "plato", nombre: "Plato" },
  { id: "combo", nombre: "Combo" },
];
