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

// Plural en español por id de unidad. Con cantidad=1 retorna singular.
// Abreviaturas (kg, g, ml, 500g, etc.) se quedan igual.
const PLURAL: Record<string, { sing: string; plur: string }> = {
  pz:             { sing: "pieza", plur: "piezas" },
  pieza:          { sing: "pieza", plur: "piezas" },
  par:            { sing: "par", plur: "pares" },
  docena:         { sing: "docena", plur: "docenas" },
  "media-docena": { sing: "media docena", plur: "medias docenas" },
  libra:          { sing: "libra", plur: "libras" },
  gramos:         { sing: "gramo", plur: "gramos" },
  l:              { sing: "litro", plur: "litros" },
  litro:          { sing: "litro", plur: "litros" },
  paq:            { sing: "paquete", plur: "paquetes" },
  paquete:        { sing: "paquete", plur: "paquetes" },
  bolsa:          { sing: "bolsa", plur: "bolsas" },
  caja:           { sing: "caja", plur: "cajas" },
  bote:           { sing: "bote", plur: "botes" },
  botella:        { sing: "botella", plur: "botellas" },
  charola:        { sing: "charola", plur: "charolas" },
  manojo:         { sing: "manojo", plur: "manojos" },
  racimo:         { sing: "racimo", plur: "racimos" },
  rebanada:       { sing: "rebanada", plur: "rebanadas" },
  orden:          { sing: "orden", plur: "órdenes" },
  porcion:        { sing: "porción", plur: "porciones" },
  plato:          { sing: "plato", plur: "platos" },
  combo:          { sing: "combo", plur: "combos" },
  vaso:           { sing: "vaso", plur: "vasos" },
  rollo:          { sing: "rollo", plur: "rollos" },
  metro:          { sing: "metro", plur: "metros" },
  servicio:       { sing: "servicio", plur: "servicios" },
  "galón":        { sing: "galón", plur: "galones" },
};

/** Retorna "pieza" / "piezas" / "kg" etc. según la cantidad. */
export function unidadFormato(unidadId: string | null | undefined, cantidad: number): string {
  if (!unidadId) return "unidad";
  const info = PLURAL[unidadId];
  if (info) return cantidad === 1 ? info.sing : info.plur;
  return unidadId;
}
