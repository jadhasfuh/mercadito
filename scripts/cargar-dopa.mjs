#!/usr/bin/env node
// Carga el catálogo de Dopa Coffee & Brunch (Sahuayo).
// Puesto + usuario tienda ya existen en DB; este script:
//   1. Refresca horario de atención (placeholder 8:00-22:00).
//   2. Borra precios + modificadores + productos previos dopa-%.
//   3. Inserta brunch + bebidas con tamaños, sabores, leche y extras como modificadores.
//
// Convención post-rediseño:
//   - Frappé / Smoothie / Soda Italiana / Tisana se modelan como UN producto
//     por categoría con "Sabor" obligatorio (en vez de 11 productos llamados solo
//     "Fresa"/"Matcha"/etc.). El diferencial de precio entre sabores va como
//     precio_extra en la opción.
//   - Café Clásico e Iced Latte siguen como productos distintos porque sus
//     nombres ya son descriptivos (Cappuccino, Spanish Latte, etc.).

const PUESTO_ID = "puesto-2d844b2e";
const FECHA = new Date().toISOString().slice(0, 10);

const HORARIO = [
  { dia: 0, abre: "08:00", cierra: "22:00" },
  { dia: 1, abre: "08:00", cierra: "22:00" },
  { dia: 2, abre: "08:00", cierra: "22:00" },
  { dia: 3, abre: "08:00", cierra: "22:00" },
  { dia: 4, abre: "08:00", cierra: "22:00" },
  { dia: 5, abre: "08:00", cierra: "22:00" },
  { dia: 6, abre: "08:00", cierra: "22:00" },
];

const SECCION = {
  brunch: "Brunch",
  coffee_classic: "Café Clásico",
  iced_latte: "Iced Latte",
  frappe: "Frappé",
  smoothie: "Smoothie",
  soda_italiana: "Soda Italiana",
  tisana: "Tisana",
};

// Bebidas que aceptan cambio de leche vegetal + extra espresso.
const APLICA_LECHE = new Set(["coffee_classic", "iced_latte", "frappe"]);

// Producto único por categoría (sabor como opción). Si el producto tiene
// `flavorPrices`, los precios se calculan como base + extra.
const BRUNCH = [
  { name: "Omelet", price: 70, emoji: "🍳" },
  { name: "Huevos al gusto", price: 70, emoji: "🍳" },
  { name: "Chilaquiles", price: 70, emoji: "🌮",
    variants: { group: "Sabor", choices: [["Verdes", 0], ["Rojos", 0]] } },
  { name: "Sandwich", price: 60, emoji: "🥪" },
  { name: "Baguette", price: 90, emoji: "🥖",
    variants: { group: "Sabor", choices: [["Pollo", 0], ["Italiano", 0]] } },
  { name: "Ensalada", price: 100, emoji: "🥗" },
  { name: "Enchiladas Suizas", price: 90, emoji: "🌯" },
  { name: "Pollo", price: 90, emoji: "🍗",
    variants: { group: "Estilo", choices: [["Plancha", 0], ["Empanizado", 0]] } },
  { name: "Tacos de Pastor", price: 70, emoji: "🌮" },
  { name: "Burrito de Pastor", price: 70, emoji: "🌯" },
  { name: "Hot Cakes", price: 60, emoji: "🥞" },
  { name: "Pan Francés", price: 60, emoji: "🍞" },
  { name: "Molletes", price: 50, emoji: "🥖",
    variants: { group: "Tipo", choices: [["Dulces", 0], ["Salados", 0]] } },
  { name: "Crepas", price: 70, emoji: "🥞",
    variants: { group: "Tipo", choices: [["Dulces", 0], ["Saladas", 0]] } },
];

const COFFEE_CLASSIC = [
  { name: "Espresso", emoji: "☕", sizes: { Chico: 30 } },
  { name: "Americano", emoji: "☕", sizes: { Chico: 40, Grande: 50 } },
  { name: "Cappuccino", emoji: "☕", sizes: { Chico: 60, Grande: 70 } },
  { name: "Latte", emoji: "☕", sizes: { Chico: 60, Grande: 70 } },
];

const ICED_LATTE = [
  { name: "Affogato", emoji: "🍨", sizes: { Chico: 65, Grande: 75 } },
  { name: "Caramel Macchiato", emoji: "🧋", sizes: { Chico: 55, Grande: 65 } },
  { name: "Mazapán Latte", emoji: "🥤", sizes: { Chico: 60, Grande: 70 } },
  { name: "Nutella Latte", emoji: "🥤", sizes: { Chico: 60, Grande: 70 } },
  { name: "Spanish Latte", emoji: "🥤", sizes: { Chico: 60, Grande: 70 } },
  { name: "Vanilla Latte", emoji: "🥤", sizes: { Chico: 55, Grande: 65 } },
  { name: "Matcha Latte", emoji: "🍵", sizes: { Chico: 55, Grande: 65 } },
];

// Para categorías con sabor variable, baseChico/baseGrande son los precios
// del sabor más barato. flavorExtra es cuánto se le suma a chico/grande por
// sabor (los gran. tienen el mismo extra que los chicos en este menú).
const FRAPPE = {
  name: "Frappé",
  emoji: "🥤",
  baseChico: 60,
  baseGrande: 70,
  flavors: [
    ["Matcha", 0],
    ["Dopa", 5],
    ["Caramelo", 0],
    ["Mazapán", 5],
    ["Nutella", 5],
    ["Cajeta", 5],
    ["Oreo", 5],
    ["Vanilla", 0],
    ["Taro", 0],
    ["Fresa", 0],
    ["Baileys", 5],
  ],
};

const SMOOTHIE = {
  name: "Smoothie",
  emoji: "🥤",
  baseChico: 55,
  baseGrande: 65,
  flavors: [["Fresa", 0], ["Frutos Rojos", 0], ["Maracuyá", 0], ["Manzana Verde", 0], ["Kiwi", 0]],
};

const SODA = {
  name: "Soda Italiana",
  emoji: "🥤",
  baseChico: 50,
  baseGrande: 60,
  flavors: [["Fresa", 0], ["Blueberry", 0], ["Manzana Verde", 0], ["Maracuyá", 0]],
};

const TISANA = {
  name: "Tisana",
  emoji: "🍵",
  baseChico: 45,
  baseGrande: 55,
  flavors: [
    ["Fusión de Moras", 0],
    ["Fresa Kiwi", 0],
    ["Fruta de la Pasión", 0],
    ["Ponche Tradicional", 0],
  ],
};

function q(s) {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const stmts = [];

// ---------- Horario ----------
stmts.push(`DELETE FROM puesto_horario_atencion WHERE puesto_id = ${q(PUESTO_ID)};`);
for (const h of HORARIO) {
  stmts.push(
    `INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES (${q(PUESTO_ID)}, ${h.dia}, ${q(h.abre)}, ${q(h.cierra)});`,
  );
}

// ---------- Limpieza ----------
stmts.push(
  `DELETE FROM modificador_opciones WHERE modificador_id IN (SELECT id FROM producto_modificadores WHERE producto_id LIKE 'dopa-%');`,
  `DELETE FROM producto_modificadores WHERE producto_id LIKE 'dopa-%';`,
  `DELETE FROM precios WHERE puesto_id = ${q(PUESTO_ID)};`,
  `DELETE FROM productos WHERE id LIKE 'dopa-%';`,
);

const usedIds = new Set();
function ensureId(base) {
  let id = `dopa-${base}`;
  let n = 2;
  while (usedIds.has(id)) id = `dopa-${base}-${n++}`;
  usedIds.add(id);
  return id;
}

let modOrden = 0;
function emitMod(productoId, nombre, obligatorio, multiple, minimo, maximo) {
  const modId = `mod-${productoId}-${++modOrden}`;
  stmts.push(
    `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden) VALUES (${q(modId)}, ${q(productoId)}, ${q(nombre)}, ${obligatorio}, ${multiple}, ${minimo === null ? "NULL" : minimo}, ${maximo === null ? "NULL" : maximo}, ${modOrden});`,
  );
  return modId;
}

function emitOpt(modId, nombre, precioExtra, orden) {
  const opcId = `mop-${modId}-${orden}`;
  stmts.push(
    `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden) VALUES (${q(opcId)}, ${q(modId)}, ${q(nombre)}, ${precioExtra}, ${orden});`,
  );
}

function emitProducto(productoId, nombre, seccion, unidad, basePrice, emoji) {
  stmts.push(
    `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible, imagen) VALUES (${q(productoId)}, ${q(nombre)}, 'cafeteria', ${q(unidad)}, NULL, ${q(seccion)}, true, ${q("emoji:" + emoji)});`,
    `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES (${q(`precio-${productoId}`)}, ${q(productoId)}, ${q(PUESTO_ID)}, ${basePrice}, ${q(FECHA)}, true);`,
  );
}

function emitExtrasLeche(productoId) {
  const lecheMod = emitMod(productoId, "Cambiar leche (opcional)", false, false, null, 1);
  ["Almendra", "Coco", "Soya"].forEach((leche, i) => {
    emitOpt(lecheMod, `Leche de ${leche.toLowerCase()}`, 5, i + 1);
  });
  const extraMod = emitMod(productoId, "Extras (opcional)", false, true, null, null);
  emitOpt(extraMod, "Extra shot de espresso", 15, 1);
}

// ---------- Brunch ----------
for (const item of BRUNCH) {
  const productoId = ensureId(`brunch-${slug(item.name)}`);
  emitProducto(productoId, item.name, "Brunch", "orden", item.price, item.emoji);
  if (item.variants) {
    const modId = emitMod(productoId, item.variants.group, true, false, null, 1);
    item.variants.choices.forEach(([nombre, extra], i) => {
      emitOpt(modId, nombre, extra, i + 1);
    });
  }
}

// ---------- Café Clásico ----------
for (const item of COFFEE_CLASSIC) {
  const productoId = ensureId(`coffee-${slug(item.name)}`);
  const sizes = Object.entries(item.sizes);
  const base = Math.min(...sizes.map(([, p]) => p));
  emitProducto(productoId, item.name, "Café Clásico", "vaso", base, item.emoji);
  if (sizes.length > 1) {
    const modId = emitMod(productoId, "Tamaño", true, false, null, 1);
    sizes.sort((a, b) => a[1] - b[1]).forEach(([nombre, precio], i) => {
      emitOpt(modId, nombre, precio - base, i + 1);
    });
  }
  emitExtrasLeche(productoId);
}

// ---------- Iced Latte ----------
for (const item of ICED_LATTE) {
  const productoId = ensureId(`iced-${slug(item.name)}`);
  const sizes = Object.entries(item.sizes);
  const base = Math.min(...sizes.map(([, p]) => p));
  emitProducto(productoId, item.name, "Iced Latte", "vaso", base, item.emoji);
  if (sizes.length > 1) {
    const modId = emitMod(productoId, "Tamaño", true, false, null, 1);
    sizes.sort((a, b) => a[1] - b[1]).forEach(([nombre, precio], i) => {
      emitOpt(modId, nombre, precio - base, i + 1);
    });
  }
  emitExtrasLeche(productoId);
}

// ---------- Categorías con sabor como opción ----------
function cargarCategoriaSabor(cat, seccionKey) {
  const productoId = ensureId(slug(cat.name.toLowerCase()));
  emitProducto(productoId, cat.name, SECCION[seccionKey], "vaso", cat.baseChico, cat.emoji);
  const saborMod = emitMod(productoId, "Sabor", true, false, null, 1);
  cat.flavors.forEach(([nombre, extra], i) => {
    emitOpt(saborMod, nombre, extra, i + 1);
  });
  const tamanoMod = emitMod(productoId, "Tamaño", true, false, null, 1);
  emitOpt(tamanoMod, "Chico", 0, 1);
  emitOpt(tamanoMod, "Grande", cat.baseGrande - cat.baseChico, 2);
  if (APLICA_LECHE.has(seccionKey)) emitExtrasLeche(productoId);
}

cargarCategoriaSabor(FRAPPE, "frappe");
cargarCategoriaSabor(SMOOTHIE, "smoothie");
cargarCategoriaSabor(SODA, "soda_italiana");
cargarCategoriaSabor(TISANA, "tisana");

console.log("BEGIN;");
for (const s of stmts) console.log(s);
console.log("COMMIT;");
console.error(`\nResumen: ${usedIds.size} productos generados`);
