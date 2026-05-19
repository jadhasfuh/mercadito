#!/usr/bin/env node
// Carga el catálogo de Dopa Coffee & Brunch (Sahuayo).
// Puesto y usuario tienda ya existen en DB; este script:
//   1. Configura/refresca el horario de atención (placeholder: 8:00-22:00 todos los días).
//   2. Borra precios y modificadores previos del puesto (idempotente).
//   3. Inserta brunch + bebidas con tamaños / opciones / extras como modificadores.

const PUESTO_ID = "puesto-2d844b2e";
const FECHA = new Date().toISOString().slice(0, 10);

// Horario placeholder — Adrian confirma con Estephanie.
const HORARIO = [
  { dia: 0, abre: "08:00", cierra: "22:00" },
  { dia: 1, abre: "08:00", cierra: "22:00" },
  { dia: 2, abre: "08:00", cierra: "22:00" },
  { dia: 3, abre: "08:00", cierra: "22:00" },
  { dia: 4, abre: "08:00", cierra: "22:00" },
  { dia: 5, abre: "08:00", cierra: "22:00" },
  { dia: 6, abre: "08:00", cierra: "22:00" },
];

// Secciones legibles.
const SECCION = {
  brunch: "Brunch",
  coffee_classic: "Café Clásico",
  iced_latte: "Iced Latte",
  frappe: "Frappé",
  smoothie: "Smoothie",
  soda_italiana: "Soda Italiana",
  tisana: "Tisana",
};

// Solo bebidas con leche aceptan cambio de leche y extra espresso.
const APLICA_LECHE = new Set(["coffee_classic", "iced_latte", "frappe"]);

const MENU = {
  brunch: [
    { name: "Omelet", price: 70 },
    { name: "Huevos al gusto", price: 70 },
    { name: "Chilaquiles", price: 70, options: ["Verdes", "Rojos"], optionGroup: "Sabor" },
    { name: "Sandwich", price: 60 },
    { name: "Baguett", price: 90, options: ["Pollo", "Italiano"], optionGroup: "Sabor" },
    { name: "Ensalada", price: 100 },
    { name: "Enchiladas Suizas", price: 90 },
    { name: "Pollo", price: 90, options: ["Plancha", "Empanizado"], optionGroup: "Estilo" },
    { name: "Tacos y Burrito de Pastor", price: 70 },
    { name: "Hot Cakes", price: 60 },
    { name: "Pan Francés", price: 60 },
    { name: "Molletes Dulces y Salados", price: 50 },
    { name: "Crepas Dulces y Saladas", price: 70 },
  ],
  coffee_classic: [
    { name: "Expresso", sizes: { ch: 30 } },
    { name: "Americano", sizes: { ch: 40, g: 50 } },
    { name: "Cappuccino", sizes: { ch: 60, g: 70 } },
    { name: "Latte", sizes: { ch: 60, g: 70 } },
  ],
  iced_latte: [
    { name: "Affogato", sizes: { ch: 65, g: 75 } },
    { name: "Caramel Macchiato", sizes: { ch: 55, g: 65 } },
    { name: "Mazapán", sizes: { ch: 60, g: 70 } },
    { name: "Nutella Latte", sizes: { ch: 60, g: 70 } },
    { name: "Spanish Latte", sizes: { ch: 60, g: 70 } },
    { name: "Vanilla Latte", sizes: { ch: 55, g: 65 } },
    { name: "Matcha Latte", sizes: { ch: 55, g: 65 } },
  ],
  frappe: [
    { name: "Matcha", sizes: { ch: 60, g: 70 } },
    { name: "Dopa", sizes: { ch: 65, g: 75 } },
    { name: "Caramelo", sizes: { ch: 60, g: 70 } },
    { name: "Mazapán", sizes: { ch: 65, g: 75 } },
    { name: "Nutella", sizes: { ch: 65, g: 75 } },
    { name: "Cajeta", sizes: { ch: 65, g: 75 } },
    { name: "Oreo", sizes: { ch: 65, g: 75 } },
    { name: "Vanilla", sizes: { ch: 60, g: 70 } },
    { name: "Taro", sizes: { ch: 60, g: 70 } },
    { name: "Fresa", sizes: { ch: 60, g: 70 } },
    { name: "Baileys", sizes: { ch: 65, g: 75 } },
  ],
  smoothie: [
    { name: "Fresa", sizes: { ch: 55, g: 65 } },
    { name: "Frutos Rojos", sizes: { ch: 55, g: 65 } },
    { name: "Maracuyá", sizes: { ch: 55, g: 65 } },
    { name: "Manzana Verde", sizes: { ch: 55, g: 65 } },
    { name: "Kiwi", sizes: { ch: 55, g: 65 } },
  ],
  soda_italiana: [
    { name: "Fresa", sizes: { ch: 50, g: 60 } },
    { name: "Blueberry", sizes: { ch: 50, g: 60 } },
    { name: "Manzana Verde", sizes: { ch: 50, g: 60 } },
    { name: "Maracuyá", sizes: { ch: 50, g: 60 } },
  ],
  tisana: [
    { name: "Fusión de Moras", sizes: { ch: 45, g: 55 } },
    { name: "Fresa Kiwi", sizes: { ch: 45, g: 55 } },
    { name: "Fruta de la Pasión", sizes: { ch: 45, g: 55 } },
    { name: "Ponche Tradicional", sizes: { ch: 45, g: 55 } },
  ],
};

const TAMANO_LABEL = { ch: "Chico", g: "Grande" };

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

// ---------- Limpieza productos previos del puesto ----------
// Sólo borramos precios + modificadores + productos cuyo id empieza con "dopa-"
// (los productos son globales pero el prefijo es nuestro convenio para este puesto).
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
function emitModificador(productoId, nombre, obligatorio, multiple, minimo, maximo) {
  const modId = `mod-${productoId}-${++modOrden}`;
  stmts.push(
    `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden) VALUES (${q(modId)}, ${q(productoId)}, ${q(nombre)}, ${obligatorio}, ${multiple}, ${minimo === null ? "NULL" : minimo}, ${maximo === null ? "NULL" : maximo}, ${modOrden});`,
  );
  return modId;
}

function emitOpcion(modId, nombre, precioExtra, orden) {
  const opcId = `mop-${modId}-${orden}`;
  stmts.push(
    `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden) VALUES (${q(opcId)}, ${q(modId)}, ${q(nombre)}, ${precioExtra}, ${orden});`,
  );
}

let totalProductos = 0;
let totalMods = 0;
let totalOpts = 0;

for (const [seccionKey, items] of Object.entries(MENU)) {
  const seccion = SECCION[seccionKey];
  const esBebida = seccionKey !== "brunch";
  const unidad = esBebida ? "vaso" : "orden";

  for (const item of items) {
    const productoId = ensureId(`${seccionKey.replace(/_/g, "-")}-${slug(item.name)}`);

    let basePrice;
    if (typeof item.price === "number") {
      basePrice = item.price;
    } else if (item.sizes) {
      basePrice = Math.min(...Object.values(item.sizes));
    } else {
      console.error(`Saltando ${productoId}: sin precio`);
      continue;
    }

    stmts.push(
      `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible) VALUES (${q(productoId)}, ${q(item.name)}, 'cafeteria', ${q(unidad)}, NULL, ${q(seccion)}, true);`,
    );
    stmts.push(
      `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES (${q(`precio-${productoId}`)}, ${q(productoId)}, ${q(PUESTO_ID)}, ${basePrice}, ${q(FECHA)}, true);`,
    );
    totalProductos++;

    // Modificador Tamaño (solo si hay > 1 tamaño)
    if (item.sizes && Object.keys(item.sizes).length > 1) {
      const modId = emitModificador(productoId, "Tamaño", true, false, null, 1);
      totalMods++;
      let i = 1;
      for (const [key, precio] of Object.entries(item.sizes).sort((a, b) => a[1] - b[1])) {
        emitOpcion(modId, TAMANO_LABEL[key], precio - basePrice, i++);
        totalOpts++;
      }
    }

    // Options sabor/estilo (brunch con variantes)
    if (item.options && item.options.length > 0) {
      const modId = emitModificador(productoId, item.optionGroup || "Opción", true, false, null, 1);
      totalMods++;
      item.options.forEach((nombre, idx) => {
        emitOpcion(modId, nombre, 0, idx + 1);
        totalOpts++;
      });
    }

    // Extras de leche vegetal + extra espresso (solo bebidas con leche)
    if (APLICA_LECHE.has(seccionKey)) {
      const lecheMod = emitModificador(productoId, "Cambiar leche (opcional)", false, false, null, 1);
      totalMods++;
      ["Almendra", "Coco", "Soya"].forEach((leche, idx) => {
        emitOpcion(lecheMod, `Leche de ${leche.toLowerCase()}`, 5, idx + 1);
        totalOpts++;
      });

      const extraMod = emitModificador(productoId, "Extras (opcional)", false, true, null, null);
      totalMods++;
      emitOpcion(extraMod, "Extra shot de espresso", 15, 1);
      totalOpts++;
    }
  }
}

console.log("BEGIN;");
for (const s of stmts) console.log(s);
console.log("COMMIT;");
console.error(
  `\nResumen: ${totalProductos} productos, ${totalMods} modificadores, ${totalOpts} opciones`,
);
