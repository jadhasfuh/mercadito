// Lista negra de palabras prohibidas en nombres de tiendas y productos
// Se normaliza el texto (sin acentos, minúsculas) antes de comparar

const PALABRAS_PROHIBIDAS = [
  // Armas
  "pistola", "rifle", "escopeta", "metralleta", "municion", "bala", "calibre",
  "cuerno de chivo", "fusil", "revolver", "cartuchos", "polvora", "granada",
  "explosivo", "detonador", "cuchillo tactico", "machete de combate",

  // Drogas
  "marihuana", "mota", "hierba mala", "cocaina", "coca", "crack", "cristal",
  "meta", "metanfetamina", "heroina", "fentanilo", "opio", "lsd", "extasis",
  "tachas", "hongos magicos", "perico", "grapa", "piedra", "churro",
  "porro", "joint", "edible", "thc", "cbd",

  // Sexo / servicios sexuales
  "escort", "sexo", "sexual", "prostitut", "scort", "masaje erotico",
  "happy ending", "nudes", "onlyfans", "contenido adulto", "xxx",
  "puta", "puto", "zorra", "ramera", "meretriz", "gigoló", "stripper",
  "table dance", "lap dance", "consolador", "vibrador", "dildo",
  "lenceria sexy", "fetiche",

  // Groserías / insultos
  "verga", "chinga", "pendej", "cabron", "culero", "mamada", "joto",
  "marica", "pinche", "hijo de", "perra", "mierda", "culo", "nalga",
  "chingadera", "puñal", "puñet", "cogida", "coger", "follar",
  "huevon", "wey pendejo", "chingar", "vergota",

  // Bromas / trolleo
  "deez nuts", "ligma", "sugma", "joe mama", "tu mama", "rickroll",
  "test123", "asdf", "hola mundo", "prueba", "fake", "falso",
  "no compren", "estafa", "fraude", "robo",

  // Otros ilegales
  "pirateria", "falsificacion", "contrabando", "lavado de dinero",
  "apuesta", "casino", "loteria clandestina",
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

    // Buscar como substring (para atrapar variaciones como "pistolas", "chingon", etc.)
    if (normalizado.includes(palabraNorm)) {
      return palabra;
    }
  }

  return null;
}
