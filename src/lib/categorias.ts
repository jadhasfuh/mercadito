// Unidades de medida disponibles
export const TODAS_UNIDADES = [
  // Peso
  { id: "kg", nombre: "Kilogramo (kg)" },
  { id: "500g", nombre: "Medio kilo (500g)" },
  { id: "250g", nombre: "Cuarto (250g)" },
  { id: "gramos", nombre: "Gramos" },
  { id: "libra", nombre: "Libra" },
  // Volumen
  { id: "litro", nombre: "Litro" },
  { id: "500ml", nombre: "Medio litro" },
  { id: "galón", nombre: "Galón" },
  // Unidades
  { id: "pieza", nombre: "Pieza" },
  { id: "par", nombre: "Par" },
  { id: "docena", nombre: "Docena" },
  { id: "media-docena", nombre: "Media docena" },
  // Agrupaciones
  { id: "paquete", nombre: "Paquete" },
  { id: "bolsa", nombre: "Bolsa" },
  { id: "caja", nombre: "Caja" },
  { id: "bote", nombre: "Bote / Lata" },
  { id: "botella", nombre: "Botella" },
  { id: "charola", nombre: "Charola" },
  { id: "manojo", nombre: "Manojo" },
  { id: "racimo", nombre: "Racimo" },
  { id: "rebanada", nombre: "Rebanada" },
  // Comida preparada
  { id: "orden", nombre: "Orden" },
  { id: "porcion", nombre: "Porción" },
  { id: "plato", nombre: "Plato" },
  { id: "combo", nombre: "Combo" },
  { id: "vaso", nombre: "Vaso" },
  // Farmacia
  { id: "tableta", nombre: "Tableta" },
  { id: "cápsula", nombre: "Cápsula" },
  { id: "sobre", nombre: "Sobre" },
  { id: "frasco", nombre: "Frasco" },
  { id: "tubo", nombre: "Tubo" },
  { id: "ampolleta", nombre: "Ampolleta" },
  // General
  { id: "rollo", nombre: "Rollo" },
  { id: "metro", nombre: "Metro" },
  { id: "servicio", nombre: "Servicio" },
];

// Unidades sugeridas por categoría (las que aparecen primero / seleccionadas)
export const UNIDADES_POR_CATEGORIA: Record<string, string[]> = {
  frutas:      ["kg", "500g", "250g", "pieza", "manojo", "racimo", "docena", "bolsa"],
  verduras:    ["kg", "500g", "250g", "pieza", "manojo", "racimo", "bolsa"],
  carnes:      ["kg", "500g", "250g", "pieza", "libra", "charola"],
  lacteos:     ["litro", "500ml", "kg", "250g", "pieza", "bote", "paquete"],
  cremeria:    ["kg", "250g", "500g", "pieza", "litro", "bote", "paquete"],
  abarrotes:   ["pieza", "paquete", "bolsa", "bote", "caja", "kg", "litro", "botella"],
  granos:      ["kg", "500g", "250g", "bolsa", "litro"],
  restaurante: ["plato", "orden", "porcion", "combo", "pieza", "vaso", "litro"],
  botanero:    ["orden", "pieza", "plato", "porcion", "combo", "vaso", "botella"],
  cafeteria:   ["vaso", "pieza", "orden", "porcion", "combo", "botella"],
  comidas:     ["orden", "plato", "porcion", "pieza", "combo"],
  antojitos:   ["orden", "pieza", "plato", "porcion", "combo", "vaso"],
  panaderia:   ["pieza", "docena", "media-docena", "paquete", "bolsa", "charola", "rebanada"],
  bebidas:     ["litro", "500ml", "botella", "vaso", "bote", "galón", "paquete"],
  farmacia:    ["pieza", "caja", "tableta", "cápsula", "sobre", "frasco", "tubo", "ampolleta", "botella"],
  limpieza:    ["pieza", "litro", "paquete", "bolsa", "bote", "rollo", "caja"],
  mascotas:    ["kg", "bolsa", "paquete", "bote", "pieza", "litro"],
  ropa:        ["pieza", "paquete", "par"],
  calzado:     ["par", "pieza"],
  otro:        ["pieza", "kg", "litro", "paquete", "caja", "bolsa", "servicio"],
};

/** Retorna las unidades para una categoría: las sugeridas primero, luego el resto */
export function getUnidadesParaCategoria(categoriaId: string): { id: string; nombre: string }[] {
  const sugeridas = UNIDADES_POR_CATEGORIA[categoriaId] || UNIDADES_POR_CATEGORIA["otro"];
  const sugeridasSet = new Set(sugeridas);

  const primero = sugeridas
    .map((id) => TODAS_UNIDADES.find((u) => u.id === id))
    .filter(Boolean) as { id: string; nombre: string }[];

  const resto = TODAS_UNIDADES.filter((u) => !sugeridasSet.has(u.id));

  return [...primero, ...resto];
}

// Plural español por id de unidad. Si la cantidad es 1 retorna singular, si no plural.
// Para abreviaturas (kg, g, ml, 500g, etc.) retorna tal cual.
const PLURAL_UNIDAD: Record<string, { sing: string; plur: string }> = {
  pieza:          { sing: "pieza", plur: "piezas" },
  par:            { sing: "par", plur: "pares" },
  docena:         { sing: "docena", plur: "docenas" },
  "media-docena": { sing: "media docena", plur: "medias docenas" },
  libra:          { sing: "libra", plur: "libras" },
  gramos:         { sing: "gramo", plur: "gramos" },
  litro:          { sing: "litro", plur: "litros" },
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
  tableta:        { sing: "tableta", plur: "tabletas" },
  "cápsula":      { sing: "cápsula", plur: "cápsulas" },
  sobre:          { sing: "sobre", plur: "sobres" },
  frasco:         { sing: "frasco", plur: "frascos" },
  tubo:           { sing: "tubo", plur: "tubos" },
  ampolleta:      { sing: "ampolleta", plur: "ampolletas" },
  rollo:          { sing: "rollo", plur: "rollos" },
  metro:          { sing: "metro", plur: "metros" },
  servicio:       { sing: "servicio", plur: "servicios" },
  "galón":        { sing: "galón", plur: "galones" },
};

/** Retorna "pieza" / "piezas" / "kg" etc. según la cantidad. */
export function unidadFormato(unidadId: string | null | undefined, cantidad: number): string {
  if (!unidadId) return "unidad";
  const info = PLURAL_UNIDAD[unidadId];
  if (info) return cantidad === 1 ? info.sing : info.plur;
  // Abreviaturas (kg, g, ml, 500g, 250g, 500ml) u otros no mapeados se dejan como están.
  return unidadId;
}
