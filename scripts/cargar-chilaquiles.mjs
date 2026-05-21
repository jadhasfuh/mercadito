#!/usr/bin/env node
// Carga el catálogo de Chilaquiles Bakery (Sahuayo) — puesto-6cde1a41.
// El puesto + usuario tienda (Yolanda) ya existen en DB; este script:
//   1. Da de alta la categoría del puesto (cafetería) y un horario base.
//   2. Borra precios + modificadores + días + productos previos chila-%.
//   3. Inserta desayunos, comidas, repostería, bebidas y promos.
//
// Convenciones (mismas que cargar-dopa.mjs):
//   - Sabores / tamaños / opciones se modelan como MODIFICADORES, no productos
//     sueltos. El diferencial de precio (ej. Large vs Grande) va como
//     precio_extra; el precio base del producto es el de la opción más barata.
//   - "Extras" (huevo, toppings…) = modificador opcional múltiple.
//   - Las PROMOS no son una entidad nueva: son productos en la sección "Promos"
//     restringidos a su día con producto_dias (la "disponibilidad" que ya
//     filtra el catálogo del cliente). El nombre lleva el día para que se lea
//     claro ("Promo Lunes: …").
//   - Los FRAPPÉS solo se sirven Domingo–Viernes (no sábado): se restringen con
//     producto_dias [0,1,2,3,4,5].

const PUESTO_ID = "puesto-6cde1a41";
const CATEGORIA = "cafeteria";
const FECHA = new Date().toISOString().slice(0, 10);

// Horario de la tienda (confirmado por Adrian): Lunes–Viernes 09:00–17:00,
// Domingo 09:00–16:30, cerrado sábado.
const HORARIO = [
  { dia: 0, abre: "09:00", cierra: "16:30" }, // Domingo
  { dia: 1, abre: "09:00", cierra: "17:00" },
  { dia: 2, abre: "09:00", cierra: "17:00" },
  { dia: 3, abre: "09:00", cierra: "17:00" },
  { dia: 4, abre: "09:00", cierra: "17:00" },
  { dia: 5, abre: "09:00", cierra: "17:00" },
];

const DOM_A_VIE = [0, 1, 2, 3, 4, 5]; // para los frappés

// ─────────────────────────── Menú ───────────────────────────
// Cada item: { name, price, emoji, desc?, dias?, mods? }
// Un mod: { nombre, req, mult, min?, max?, ops: [[nombre, precio_extra], ...] }
const MENU = [
  {
    seccion: "Desayunos",
    unidad: "orden",
    items: [
      { name: "Enchiladas Suizas", price: 85, emoji: "🌯",
        desc: "4 tortillas de maíz rellenas de pollo, bañadas en salsa de tomate, con queso gratinado y cebolla morada desflemada." },
      { name: "Enchiladas Poblanas", price: 90, emoji: "🌯",
        desc: "4 tortillas de maíz rellenas de pollo, bañadas en salsa poblana con queso gratinado, tiras de chile poblano, elote y cebolla morada desflemada." },
      { name: "Quesadillas", price: 45, emoji: "🫓",
        desc: "3 tortillas de maíz rellenas de queso mozzarella acompañadas de frijol y pieza de bolillo." },
      { name: "Quesadillas Bañadas", price: 65, emoji: "🫓",
        desc: "3 tortillas de maíz rellenas de queso mozzarella bañadas en la salsa de la casa, roja o verde.",
        mods: [{ nombre: "Salsa", req: true, mult: false, max: 1, ops: [["Roja", 0], ["Verde", 0]] }] },
      { name: "Lonche de Chilaquiles", price: 70, emoji: "🥪",
        desc: "Nuestro rico pan estilo bolillo relleno de tus chilaquiles favoritos, con aderezo de la casa, crema y queso. Uno de los favoritos.",
        mods: [{ nombre: "Extras (opcional)", req: false, mult: true, ops: [["Huevo estrellado", 15]] }] },
      { name: "Lonche de Panela", price: 75, emoji: "🥪",
        desc: "Nuestro rico pan con panela asada, aderezo de la casa, crema, frijol, jitomate, cebolla y aguacate.",
        mods: [
          { nombre: "Jalapeño", req: false, mult: false, max: 1, ops: [["Con jalapeño", 0], ["Sin jalapeño", 0]] },
          { nombre: "Extras (opcional)", req: false, mult: true, ops: [["Chilaquiles", 15], ["Huevo", 15], ["Jamón", 15]] },
        ] },
      { name: "Lonche de Pierna Adobada", price: 80, emoji: "🥪",
        desc: "Nuestro rico pan con deliciosa carne adobada deshebrada, frijol, jitomate, cebolla y aguacate.",
        mods: [
          { nombre: "Jalapeño", req: false, mult: false, max: 1, ops: [["Con jalapeño", 0], ["Sin jalapeño", 0]] },
          { nombre: "Extras (opcional)", req: false, mult: true, ops: [["Chilaquiles", 15], ["Huevo", 15]] },
        ] },
      { name: "Lonche de Arrachera", price: 100, emoji: "🥪",
        desc: "Nuestro rico pan con arrachera, frijol refrito, chile morrón, cebolla morada y queso mozzarella gratinado. La fusión perfecta." },
    ],
  },
  {
    seccion: "Comidas",
    unidad: "orden",
    items: [
      { name: "Sopa de Tortilla", price: 85, emoji: "🍲",
        desc: "Caldo de jitomate, acompañado de tiras de tortilla crujientes, panela fresca, aguacate y crema." },
      { name: "Flautas", price: 70, emoji: "🌯",
        desc: "Cinco deliciosas flautas acompañadas con nuestra salsa de la casa, crema, queso fresco y lechuga.",
        mods: [{ nombre: "Relleno", req: true, mult: false, max: 1, ops: [["Pollo", 0], ["Frijol", 0], ["Mixtas", 0]] }] },
      { name: "Tostadas", price: 65, emoji: "🫓",
        desc: "Con frijol, lechuga, jitomate, queso fresco, crema, aguacate y salsa.",
        mods: [{ nombre: "Proteína", req: true, mult: false, max: 1, ops: [["Pierna", 0], ["Jamón", 0]] }] },
      { name: "Enchiladas Suizas", price: 85, emoji: "🌯",
        desc: "4 tortillas de maíz rellenas de pollo, bañadas en salsa de tomate, con queso gratinado y cebolla morada desflemada." },
      { name: "Enchiladas Poblanas", price: 90, emoji: "🌯",
        desc: "4 tortillas de maíz rellenas de pollo, bañadas en salsa poblana con queso gratinado, tiras de chile poblano, elote y cebolla morada desflemada." },
      { name: "Taco de Arrachera", price: 45, emoji: "🌮",
        desc: "Un taco de arrachera con cebolla y morrón guisado y queso gratinado." },
      { name: "Taco de Pollo", price: 40, emoji: "🌮",
        desc: "Un taco de pollo guisado con cebolla morada, morrón y queso gratinado." },
    ],
  },
  {
    seccion: "Repostería",
    unidad: "pieza",
    items: [
      { name: "Waffle Blue Berry", price: 70, emoji: "🧇",
        desc: "Delicioso waffle acompañado con fruta de temporada a elegir, endulzado al gusto.",
        mods: [{ nombre: "Endulzante", req: true, mult: false, max: 1, ops: [["Lechera", 0], ["Chocolate", 0], ["Cajeta", 0], ["Miel", 0], ["Nutella", 0]] }] },
      { name: "Crepa Sencilla", price: 50, emoji: "🥞",
        desc: "Crepa ármala a tu gusto. Toppings disponibles desde $10.",
        mods: [{ nombre: "Toppings (opcional)", req: false, mult: true, ops: [
          ["Fresa", 10], ["Plátano", 10], ["Manzana", 10], ["Nutella", 10], ["Lechera", 10],
          ["Mermelada de fresa", 10], ["Oreo", 10], ["Coco blanco", 10], ["Coco tostado", 10],
          ["Bola de nieve de vainilla", 20],
        ] }] },
      { name: "Pan de Elote", price: 27, emoji: "🍰",
        desc: "Especialidad de la casa, sencillo o con un toque de rompope y coco tostado.",
        mods: [{ nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Chico / sencillo", 0], ["Grande / con rompope y coco tostado", 21]] }] },
      { name: "Cuernitos", price: 40, emoji: "🥐", desc: "Cuernito relleno de nutella." },
      { name: "Cuernito de la Casa", price: 60, emoji: "🥐",
        desc: "Nuestro delicioso cuernito con nutella, relleno de fresa, crema chantilly, decorado con coco blanco." },
      { name: "Panque de Temporada", price: 48, emoji: "🍰", desc: "Pregunta por el sabor del mes." },
      { name: "Galletas de Granola", price: 25, emoji: "🍪" },
      { name: "Galletas de Chispas de Chocolate y Nuez", price: 25, emoji: "🍪" },
      { name: "Centenario", price: 25, emoji: "🥐" },
      { name: "Chocolatín", price: 28, emoji: "🥐" },
    ],
  },
  {
    seccion: "Bebidas — Barra Caliente",
    unidad: "vaso",
    items: [
      { name: "Café Americano", price: 40, emoji: "☕" },
      { name: "Expresso", price: 35, emoji: "☕" },
      { name: "Expresso Cortado", price: 40, emoji: "☕" },
      { name: "Latte", price: 57, emoji: "☕",
        mods: [{ nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Clásico", 0], ["Vainilla", 0], ["Crema irlandesa", 0], ["Avellana", 0], ["Caramelo", 0], ["Cajeta", 0]] }] },
      { name: "Capuchino", price: 57, emoji: "☕",
        mods: [{ nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Clásico", 0], ["Vainilla", 0], ["Crema irlandesa", 0], ["Avellana", 0], ["Caramelo", 0], ["Cajeta", 0], ["Mocka", 0]] }] },
      { name: "Chocolate", price: 57, emoji: "🍫" },
      { name: "Taro", price: 57, emoji: "🥤" },
      { name: "Matcha", price: 57, emoji: "🍵" },
      { name: "Té Chai", price: 57, emoji: "🍵" },
      { name: "Tizana", price: 57, emoji: "🍵" },
      { name: "Té de Manzanilla", price: 25, emoji: "🍵" },
    ],
  },
  {
    seccion: "Bebidas — Barra Fría",
    unidad: "vaso",
    items: [
      { name: "Americano en las Rocas", price: 55, emoji: "🧊",
        mods: [{ nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 11]] }] },
      { name: "Afogatto", price: 60, emoji: "🍨",
        desc: "Dos bolas de nieve de vainilla con una carga del café de la casa." },
      { name: "Latte en las Rocas", price: 58, emoji: "🧊",
        desc: "Bebida con café mezcla de la casa.",
        mods: [
          { nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 9]] },
          { nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Clásico", 0], ["Crema irlandesa", 0], ["Vainilla francesa", 0], ["Avellana", 0], ["Caramel macchiato", 0]] },
        ] },
      { name: "Latte en las Rocas Especial", price: 58, emoji: "🧊",
        desc: "Sabores especiales: taro, matcha o chai.",
        mods: [
          { nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 9]] },
          { nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Taro", 0], ["Matcha", 0], ["Chai", 0]] },
          { nombre: "Extras (opcional)", req: false, mult: true, ops: [["Leche de almendra o sabor adicional", 15]] },
        ] },
      { name: "Frappé", price: 59, emoji: "🥤", dias: DOM_A_VIE,
        desc: "Servicio de frappés de domingo a viernes.",
        mods: [
          { nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 9]] },
          { nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Clásico", 0], ["Vainilla", 0], ["Mazapán", 0], ["Oreo", 0], ["Mocka", 0], ["Rompope", 0], ["Nutella", 0], ["Chai", 0], ["Taro", 0], ["Matcha", 0], ["Caramelo", 0]] },
        ] },
      { name: "Frappé de Temporada", price: 65, emoji: "🥤", dias: DOM_A_VIE,
        desc: "Pregunta por la bebida del mes. Servicio de domingo a viernes.",
        mods: [{ nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 10]] }] },
      { name: "Smoothie", price: 59, emoji: "🥤",
        desc: "Bebida a base de agua o leche.",
        mods: [
          { nombre: "Tamaño", req: true, mult: false, max: 1, ops: [["Grande", 0], ["Large", 9]] },
          { nombre: "Sabor", req: true, mult: false, max: 1, ops: [["Fresa", 0], ["Maracuyá", 0], ["Mora azul", 0], ["Taro", 0], ["Matcha", 0]] },
          { nombre: "Base", req: true, mult: false, max: 1, ops: [["Agua", 0], ["Leche", 0]] },
        ] },
      { name: "Tazón de Yogurt con Fruta", price: 70, emoji: "🥣",
        desc: "Yogurt artesanal acompañado de fruta de temporada, con 2 toppings a elegir.",
        mods: [{ nombre: "Toppings (elige 2)", req: true, mult: true, min: 2, max: 2, ops: [["Granola", 0], ["Arándano", 0], ["Coco blanco", 0], ["Coco tostado", 0]] }] },
      { name: "Agua del Día", price: 30, emoji: "🥤" },
      { name: "Botella de agua 500ml", price: 15, emoji: "💧" },
      { name: "Coca Cola / Coca Zero 355ml", price: 30, emoji: "🥤",
        mods: [{ nombre: "Tipo", req: true, mult: false, max: 1, ops: [["Coca Cola", 0], ["Coca Zero", 0]] }] },
    ],
  },
];

// ─────────────────────────── Promos por día ───────────────────────────
// day_index del menú = DOW de Postgres (Domingo=0 … Sábado=6). Lunes=1, etc.
const PROMOS = [
  { dia: 1, diaNombre: "Lunes", name: "2 Frappés Large", price: 110, emoji: "🥤" },
  { dia: 2, diaNombre: "Martes", name: "2 Capuchinos Grande", price: 99.9, emoji: "☕" },
  { dia: 3, diaNombre: "Miércoles", name: "Chilaquiles y café americano", price: 99, emoji: "🌮" },
  { dia: 4, diaNombre: "Jueves", name: "Enchiladas suizas y agua del día", price: 90, emoji: "🌯" },
  { dia: 5, diaNombre: "Viernes", name: "2 Frappés Grande", price: 95, emoji: "🥤" },
];

// ─────────────────────────── Helpers ───────────────────────────
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
const usedIds = new Set();
function ensureId(base) {
  let id = `chila-${base}`;
  let n = 2;
  while (usedIds.has(id)) id = `chila-${base}-${n++}`;
  usedIds.add(id);
  return id;
}

let modSeq = 0;
function emitMod(productoId, nombre, obligatorio, multiple, minimo, maximo) {
  const modId = `mod-${productoId}-${++modSeq}`;
  stmts.push(
    `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden) VALUES (${q(modId)}, ${q(productoId)}, ${q(nombre)}, ${obligatorio}, ${multiple}, ${minimo == null ? "NULL" : minimo}, ${maximo == null ? "NULL" : maximo}, ${modSeq});`,
  );
  return modId;
}

function emitOpt(modId, nombre, precioExtra, orden) {
  stmts.push(
    `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden) VALUES (${q(`mop-${modId}-${orden}`)}, ${q(modId)}, ${q(nombre)}, ${precioExtra}, ${orden});`,
  );
}

function emitProducto(productoId, nombre, seccion, unidad, precio, emoji, descripcion) {
  stmts.push(
    `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible, imagen) VALUES (${q(productoId)}, ${q(nombre)}, ${q(CATEGORIA)}, ${q(unidad)}, ${q(descripcion ?? null)}, ${q(seccion)}, true, ${q("emoji:" + emoji)});`,
    `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES (${q(`precio-${productoId}`)}, ${q(productoId)}, ${q(PUESTO_ID)}, ${precio}, ${q(FECHA)}, true);`,
  );
}

function emitDias(productoId, dias) {
  for (const d of dias) {
    stmts.push(`INSERT INTO producto_dias (producto_id, dia_semana) VALUES (${q(productoId)}, ${d});`);
  }
}

function emitMods(productoId, mods) {
  for (const m of mods ?? []) {
    const modId = emitMod(productoId, m.nombre, m.req, m.mult, m.min ?? null, m.max ?? null);
    m.ops.forEach(([nombre, extra], i) => emitOpt(modId, nombre, extra, i + 1));
  }
}

// ─────────────────────────── Limpieza ───────────────────────────
stmts.push(
  `DELETE FROM modificador_opciones WHERE modificador_id IN (SELECT id FROM producto_modificadores WHERE producto_id LIKE 'chila-%');`,
  `DELETE FROM producto_modificadores WHERE producto_id LIKE 'chila-%';`,
  `DELETE FROM producto_dias WHERE producto_id LIKE 'chila-%';`,
  `DELETE FROM precios WHERE puesto_id = ${q(PUESTO_ID)};`,
  `DELETE FROM productos WHERE id LIKE 'chila-%';`,
);

// ─────────────────────────── Categoría + horario del puesto ───────────────────────────
stmts.push(
  `DELETE FROM puesto_categorias WHERE puesto_id = ${q(PUESTO_ID)};`,
  `INSERT INTO puesto_categorias (puesto_id, categoria_id) VALUES (${q(PUESTO_ID)}, ${q(CATEGORIA)});`,
  `DELETE FROM puesto_horario_atencion WHERE puesto_id = ${q(PUESTO_ID)};`,
);
for (const h of HORARIO) {
  stmts.push(
    `INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES (${q(PUESTO_ID)}, ${h.dia}, ${q(h.abre)}, ${q(h.cierra)});`,
  );
}

// ─────────────────────────── Productos ───────────────────────────
for (const grupo of MENU) {
  for (const item of grupo.items) {
    const productoId = ensureId(`${slug(grupo.seccion)}-${slug(item.name)}`);
    emitProducto(productoId, item.name, grupo.seccion, grupo.unidad, item.price, item.emoji, item.desc);
    emitMods(productoId, item.mods);
    if (item.dias) emitDias(productoId, item.dias);
  }
}

// ─────────────────────────── Promos ───────────────────────────
for (const promo of PROMOS) {
  const productoId = ensureId(`promo-${slug(promo.diaNombre)}`);
  const nombre = `Promo ${promo.diaNombre}: ${promo.name}`;
  emitProducto(productoId, nombre, "Promos", "orden", promo.price, promo.emoji,
    `Promoción válida solo los ${promo.diaNombre.toLowerCase()}.`);
  emitDias(productoId, [promo.dia]);
}

console.log("BEGIN;");
for (const s of stmts) console.log(s);
console.log("COMMIT;");
console.error(`\nResumen: ${usedIds.size} productos generados (${PROMOS.length} promos).`);
