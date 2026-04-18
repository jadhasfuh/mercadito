// Lista negra de palabras prohibidas en nombres de tiendas y productos
// Se normaliza el texto (sin acentos, minúsculas) antes de comparar
// IMPORTANTE: evitar palabras que choquen con productos reales
// (coca, cristal, piedra, churro, perico, crack, meta, etc.)

const PALABRAS_PROHIBIDAS = [
  // Armas
  "pistola", "rifle", "escopeta", "metralleta", "municion", "calibre 38",
  "cuerno de chivo", "fusil", "revolver", "cartuchos", "polvora", "granada",
  "explosivo", "detonador",

  // Drogas (solo terminos que no chocan con productos reales)
  "marihuana", "mota", "cocaina", "metanfetamina", "heroina", "fentanilo",
  "lsd", "extasis", "tachas", "hongos magicos",

  // Sexo / servicios sexuales
  "escort", "prostitut", "scort", "masaje erotico",
  "happy ending", "nudes", "onlyfans", "contenido adulto", "xxx",
  "ramera", "meretriz", "gigolo", "stripper",
  "table dance", "lap dance", "consolador", "vibrador", "dildo",

  // Groserias / insultos
  "verga", "chinga", "pendej", "culero", "mamada",
  "marica", "mierda", "chingadera", "puñet", "cogida", "follar",
  "vergota",

  // Bromas / trolleo
  "deez nuts", "ligma", "sugma", "joe mama", "tu mama",
  "no compren", "estafa", "fraude",

  // Otros ilegales
  "pirateria", "falsificacion", "contrabando", "lavado de dinero",
  "apuesta ilegal", "loteria clandestina",
];

/**
 * Verifica si un texto contiene palabras prohibidas.
 * Retorna la palabra encontrada o null si está limpio.
 */
export function verificarListaNegra(texto: string): string | null {
  const normalizado = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ")   // solo letras, números y espacios
    .replace(/\s+/g, " ")
    .trim();

  for (const palabra of PALABRAS_PROHIBIDAS) {
    const palabraNorm = palabra
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalizado.includes(palabraNorm)) {
      return palabra;
    }
  }

  return null;
}
