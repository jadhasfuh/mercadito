#!/usr/bin/env node
// Carga el puesto OH LA LA! (cafetería + panadería en Sahuayo centro).
// Menú flat, sin variantes ni modificadores. Algunos productos vienen marcados
// como "Agotado" → disponible=false.

const PUESTO_ID = "ohlala";
const USUARIO_ID = "tienda-ohlala";
const TELEFONO = "3531009223";
const PIN = "120306";
const NOMBRE = "OH LA LA!";
const DIRECCION = "Francisco I. Madero 238, Centro Dos, 59000 Sahuayo de Morelos, Mich.";
const LAT = 20.060874215741727;
const LNG = -102.72207104417899;
// 0=dom, 1=lun, 2=mar, 3=mié, 4=jue, 5=vie, 6=sáb
const HORARIO = [
  { dia: 0, abre: "10:00", cierra: "22:00" },
  { dia: 1, abre: "08:30", cierra: "21:30" },
  { dia: 2, abre: "08:30", cierra: "21:30" },
  { dia: 3, abre: "08:30", cierra: "21:30" },
  { dia: 4, abre: "08:30", cierra: "21:30" },
  { dia: 5, abre: "08:30", cierra: "22:00" },
  { dia: 6, abre: null, cierra: null }, // sábado cerrado
];
const FECHA = new Date().toISOString().slice(0, 10);

// [section, name, price, description, agotado, unidad?]
const PRODUCTOS = [
  ["Merch", "Tote bag", 139, null, false, "pieza"],

  ["Especiales del mes", "Latte Mom Chic", 68, null, false],
  ["Especiales del mes", "Coco Vibes Taro", 68, null, false],
  ["Especiales del mes", "Purple Matcha", 68, null, false],
  ["Especiales del mes", "Espresso Tonic", 66, null, false],
  ["Especiales del mes", "Lychee Blossom", 60, null, false],

  ["Especiales OH LA LA!", "Cinnamon Latte", 65, null, false],
  ["Especiales OH LA LA!", "Latte Trufa de Avellana", 64, null, false],
  ["Especiales OH LA LA!", "Latte avellana blanca", 64, null, false],
  ["Especiales OH LA LA!", "Salty Bliss", 64, null, false],
  ["Especiales OH LA LA!", "Aura Latte", 68, null, false],

  ["Matcha Mood", "Iced Matcha Latte", 51, "La más trendy de todas. Si te cansas de lo clásico puedes convertirla en un dirty matcha agregándole café.", false],
  ["Matcha Mood", "Coconut Matcha", 66, null, false],
  ["Matcha Mood", "Matcha Latte Caliente 🔥", 57, null, false],
  ["Matcha Mood", "Iced Pinky Matcha", 53, null, false],
  ["Matcha Mood", "Matcha Mango", 62, null, false],
  ["Matcha Mood", "Matcha Taro", 65, null, false],
  ["Matcha Mood", "Frapuccino Matcha", 58, "Matcha por aquí y matcha por allá; pídelo y te va a gustar.", false],
  ["Matcha Mood", "Affogato Matcha", 68, "Mezcla del gelato y el matcha. Una experiencia diferente que tienes que probar.", false],

  ["Bebidas Calientes", "Espresso", 31, "Shot de café con concentración fuerte y oscura.", false],
  ["Bebidas Calientes", "Double Espresso", 41, "Doble shot de café concentrado y oscuro.", false],
  ["Bebidas Calientes", "Americano Caliente 🔥", 36, "Espresso con agua caliente — café en menor concentración.", false],
  ["Bebidas Calientes", "Double Americano 🔥", 45, "Doble espresso con agua caliente — para los que buscan intensidad.", false],
  ["Bebidas Calientes", "Latte Tradicional Caliente 🔥", 46, "Conocido como café lechero — la elección segura.", false],
  ["Bebidas Calientes", "Latte de sabor Caliente 🔥", 52, "Café y leche con un toque de sabor.", false],
  ["Bebidas Calientes", "Caramel Macchiato Caliente 🔥", 55, "Intensidad y suavidad con una chispa dulce de caramelo.", false],
  ["Bebidas Calientes", "Capuccino Tradicional Caliente 🔥", 44, "Leche espumosa, café y una pizca de canela.", false],
  ["Bebidas Calientes", "Capuccino de sabor Caliente 🔥", 51, "Café y leche espumada con un shot de sabor.", false],

  ["Bebidas Frías", "Cold Brew", 45, "Café reposado 24-48 hrs para liberar sabores en excelente calidad.", false],
  ["Bebidas Frías", "Cold Brew Latte", 49, "Combinación de cold brew con tu leche favorita.", false],
  ["Bebidas Frías", "Cold Brew Vainilla Cream", 55, "Cold brew con un toque de crema de vainilla.", false],
  ["Bebidas Frías", "Americano en las rocas", 37, "Café fuerte, frío y fancy.", false],
  ["Bebidas Frías", "Iced Latte de sabor", 48, "Latte frío con sabor a tu gusto.", false],
  ["Bebidas Frías", "Iced Latte Tradicional", 42, "Si no sabes por dónde empezar, no falla.", false],
  ["Bebidas Frías", "Frappe de café", 56, "Leche espumosa, café y hielo molido.", false],
  ["Bebidas Frías", "Frapuccino Tradicional", 50, "Leche espumosa, café, hielo y una pizca de canela.", false],
  ["Bebidas Frías", "Frapuccino de sabor", 50, "Frap con tu sabor favorito.", false],
  ["Bebidas Frías", "Frapuccino Especial", 60, null, false],
  ["Bebidas Frías", "Caramel Affogato", 63, "Gelato y café — una experiencia diferente.", false],
  ["Bebidas Frías", "Iced Caramel Macchiato", 54, "Iconic — para los selectivos y apasionados por el café.", false],
  ["Bebidas Frías", "Dirty Chai", 60, null, false],
  ["Bebidas Frías", "Taro Latte", 54, null, false],

  ["Bebidas sin café", "Sweetberry", 55, "Bebida de color rosa con base de fresa.", false],
  ["Bebidas sin café", "Berry Garden", 55, "Trocitos de fruta natural; se acaba antes de que lo pienses.", false],
  ["Bebidas sin café", "Blueberry Limonade", 55, null, false],
  ["Bebidas sin café", "Mango Fresh", 55, "Coco y mango — la dupla efectiva para el verano.", false],

  ["Tés", "Té", 30, "Antioxidante, ayuda al sistema cardiovascular. Alternativa al café.", false],
  ["Tés", "Tisana Tentación", 55, "Blueberry, uva pasa, arándano, fresa, cereza.", false],
  ["Tés", "Tisana Tropical", 55, "Mandarina, manzana, pera, mango, chabacano.", false],
  ["Tés", "Tisana París", 55, "Fresa, manzana, jamaica, pétalos de rosa.", false],
  ["Tés", "Tisana Ohana", 55, "Coco, manzana verde, naranja, piña, kiwi.", false],
  ["Tés", "Kombucha", 45, "La mejor opción para iniciar el día — probióticos y cero calorías.", false],
  ["Tés", "Té Chai", 54, "Aumenta el nivel de energía, reduce glucosa y colesterol.", false],
  ["Tés", "Chocolate Caliente", 49, null, false],
  ["Tés", "Botella de agua 500ml", 10, null, true],

  ["Panadería", "Panini", 69, "Personalízalo a tu antojo.", false, "pieza"],
  ["Panadería", "Croissant Salado", 49, "No necesitas ir a Francia para comer esta delicatessen.", false, "pieza"],
  ["Panadería", "Croissant Relleno", 39, "Croissant relleno — pídelo como prefieras.", false, "pieza"],
  ["Panadería", "Pan Brioche", 25, "Suave y ligero con centro de avellana. Pídelo calientito.", true, "pieza"],
  ["Panadería", "Bollos arándano con chocolate", 33, "Pan con trozos de fruta — combina suavidad con sabor dulce.", true, "pieza"],
  ["Panadería", "Galleta de Chispas", 20, "La vieja confiable — infalible e irresistible.", false, "pieza"],
  ["Panadería", "Pay de Queso", 55, "Textura ganadora — consiéntete con un pay.", true, "porcion"],
  ["Panadería", "Cup Roll", 20, null, false, "pieza"],
  ["Panadería", "Brownie", 50, null, false, "pieza"],
  ["Panadería", "Alfajor", 35, null, false, "pieza"],
  ["Panadería", "Macarroon", 20, null, true, "pieza"],
  ["Panadería", "Galleta mantequilla", 7, null, false, "pieza"],
  ["Panadería", "Galleta de nuez", 8, null, false, "pieza"],
  ["Panadería", "Galleta de avena horneada", 25, "Galleta de avena, arándano, nuez y coco.", true, "pieza"],
  ["Panadería", "Galleta de amaranto", 25, "Galleta de amaranto, arándano, nuez y coco.", false, "pieza"],
  ["Panadería", "Flor de azúcar", 10, "Galleta con centro de fresa.", false, "pieza"],
  ["Panadería", "Doraditas", 22, "Doraditas rellenas de cajeta.", false, "pieza"],
  ["Panadería", "3 Polvorones", 10, "Pack de 3 polvorones.", false, "pieza"],
];

function q(s) {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}
function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const stmts = [];

stmts.push(
  `INSERT INTO puestos (id, nombre, descripcion, ubicacion, lat, lng, telefono_contacto, activo, aprobado, lead_time_dias)`,
  `VALUES (${q(PUESTO_ID)}, ${q(NOMBRE)}, ${q("Cafetería + panadería en Sahuayo centro")}, ${q(DIRECCION)}, ${LAT}, ${LNG}, ${q(TELEFONO)}, true, true, 0)`,
  `ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, ubicacion = EXCLUDED.ubicacion, lat = EXCLUDED.lat, lng = EXCLUDED.lng, telefono_contacto = EXCLUDED.telefono_contacto;`,
);

stmts.push(
  `INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo)`,
  `VALUES (${q(USUARIO_ID)}, ${q(NOMBRE)}, ${q(TELEFONO)}, ${q(PIN)}, 'tienda', ${q(PUESTO_ID)}, true)`,
  `ON CONFLICT (id) DO UPDATE SET pin = EXCLUDED.pin, puesto_id = EXCLUDED.puesto_id, activo = EXCLUDED.activo;`,
);

stmts.push(`DELETE FROM puesto_horario_atencion WHERE puesto_id = ${q(PUESTO_ID)};`);
for (const h of HORARIO) {
  stmts.push(
    `INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES (${q(PUESTO_ID)}, ${h.dia}, ${q(h.abre)}, ${q(h.cierra)});`,
  );
}

const usedIds = new Set();
function ensureId(base) {
  let id = `ohl-${base}`;
  let n = 2;
  while (usedIds.has(id)) id = `ohl-${base}-${n++}`;
  usedIds.add(id);
  return id;
}

let total = 0;
let agotados = 0;
for (const [seccion, nombre, precio, descripcion, agotado, unidadOverride] of PRODUCTOS) {
  const id = ensureId(slug(nombre));
  const unidad = unidadOverride || (seccion === "Merch" ? "pieza" : seccion === "Panadería" ? "pieza" : "vaso");
  const disponible = !agotado;
  if (agotado) agotados++;
  stmts.push(
    `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible) VALUES (${q(id)}, ${q(nombre)}, 'cafeteria', ${q(unidad)}, ${q(descripcion)}, ${q(seccion)}, ${disponible});`,
  );
  stmts.push(
    `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES (${q(`precio-${id}`)}, ${q(id)}, ${q(PUESTO_ID)}, ${precio}, ${q(FECHA)}, true);`,
  );
  total++;
}

console.log("BEGIN;");
for (const s of stmts) console.log(s);
console.log("COMMIT;");
console.error(`Resumen: ${total} productos (${agotados} marcados como agotados)`);
