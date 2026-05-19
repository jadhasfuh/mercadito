#!/usr/bin/env node
// Genera SQL para cargar el puesto Amazónico + todo su catálogo.
// El JSON del menú está embebido. Salida a stdout.
//
// Convenciones:
//  - categoria_id = 'restaurante' para todos
//  - seccion = nombre de subcategoría (Molletes, HotCakes...)
//  - subseccion = nombre de categoría (Desayunos, Brunch, Lunch & Dinner, Bebidas & Drinks)
//  - precio base: producto.price si no es null; si es null y hay sizes, min(size.price)
//  - sizes / options / modifiers → todos a producto_modificadores + modificador_opciones
//    con precio_extra = size.price - base | option.choice.price_modifier | modifier.price
//  - tags y disclaimer se ignoran (Adrian decide después si los surfacea)

import { readFileSync } from "node:fs";

const MENU = JSON.parse(readFileSync(new URL("./amazonico-menu.json", import.meta.url), "utf8"));

const PUESTO_ID = "amazonico";
const USUARIO_ID = "tienda-amazonico";
const TELEFONO = "3531485059";
const PIN = "120306";
const NOMBRE = "Amazónico";
const DIRECCION =
  "C. Rayón 343, Llanos de Sahuayo, 59010 Sahuayo de Morelos, Mich.";
const LAT = 20.06084360412958;
const LNG = -102.71358538280623;
// Horario: cerrado lunes (dia=1). 0=dom, 1=lun, 2=mar... 6=sab
const HORA_APERTURA = "08:00";
const HORA_CIERRE = "23:00";
const DIAS_ABIERTOS = [0, 2, 3, 4, 5, 6];
const DIA_CERRADO = 1;
const FECHA_PRECIO = new Date().toISOString().slice(0, 10);

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

function pickUnidad(categoriaName, subcategoriaName) {
  const c = (categoriaName + " " + subcategoriaName).toLowerCase();
  if (/(bebida|drink|frapp|smoothie|licuado|malteada|caf|latte|chai|matcha|t[eé]\b|chocolate|limonada|naranjada|jugo|tisana|chamoilada|kombucha)/.test(c)) return "vaso";
  if (/(cerveza|refresco|pe.afiel|topochico|pellegrino|perrier|botella)/.test(c)) return "botella";
  if (/(postre)/.test(c)) return "porcion";
  return "orden";
}

const stmts = [];

// ---------- Puesto ----------
stmts.push(
  `INSERT INTO puestos (id, nombre, descripcion, ubicacion, lat, lng, telefono_contacto, activo, aprobado, lead_time_dias)`,
  `VALUES (${q(PUESTO_ID)}, ${q(NOMBRE)}, ${q(
    "Desayunos, brunch, lunch & cafetería. Aviso: el consumo de proteínas crudas es responsabilidad del consumidor.",
  )}, ${q(DIRECCION)}, ${LAT}, ${LNG}, ${q(TELEFONO)}, true, true, 0)`,
  `ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, ubicacion = EXCLUDED.ubicacion, lat = EXCLUDED.lat, lng = EXCLUDED.lng, telefono_contacto = EXCLUDED.telefono_contacto, activo = EXCLUDED.activo;`,
);

// ---------- Usuario tienda ----------
stmts.push(
  `INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo)`,
  `VALUES (${q(USUARIO_ID)}, ${q(NOMBRE)}, ${q(TELEFONO)}, ${q(PIN)}, 'tienda', ${q(PUESTO_ID)}, true)`,
  `ON CONFLICT (id) DO UPDATE SET pin = EXCLUDED.pin, puesto_id = EXCLUDED.puesto_id, activo = EXCLUDED.activo;`,
);

// ---------- Horario atención ----------
stmts.push(`DELETE FROM puesto_horario_atencion WHERE puesto_id = ${q(PUESTO_ID)};`);
for (const d of DIAS_ABIERTOS) {
  stmts.push(
    `INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES (${q(PUESTO_ID)}, ${d}, ${q(HORA_APERTURA)}, ${q(HORA_CIERRE)});`,
  );
}
// Día cerrado: fila con abre/cierra NULL para señalar explícitamente.
stmts.push(
  `INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES (${q(PUESTO_ID)}, ${DIA_CERRADO}, NULL, NULL);`,
);

// ---------- Productos ----------
const usedIds = new Set();
function ensureId(base) {
  let id = `amz-${base}`;
  let n = 2;
  while (usedIds.has(id)) id = `amz-${base}-${n++}`;
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

function emitModificadorOpcion(modId, nombre, precioExtra, orden) {
  const opcId = `mop-${modId}-${orden}`;
  stmts.push(
    `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden) VALUES (${q(opcId)}, ${q(modId)}, ${q(nombre)}, ${precioExtra}, ${orden});`,
  );
}

let totalProductos = 0;
let totalModificadores = 0;
let totalOpciones = 0;

for (const cat of MENU.categories) {
  for (const sub of cat.subcategories) {
    for (const prod of sub.products) {
      const productoId = ensureId(slug(`${sub.id}-${prod.id || slug(prod.name)}`));
      let basePrice = prod.price;
      if (basePrice === null || basePrice === undefined) {
        if (Array.isArray(prod.sizes) && prod.sizes.length > 0) {
          basePrice = Math.min(...prod.sizes.map((s) => s.price));
        } else {
          // Producto sin precio — saltamos
          console.error(`Saltando ${productoId}: sin precio base`);
          continue;
        }
      }

      const descripcion = prod.description || null;
      const unidad = pickUnidad(cat.name, sub.name);

      stmts.push(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, subseccion, disponible) VALUES (${q(productoId)}, ${q(prod.name)}, 'restaurante', ${q(unidad)}, ${q(descripcion)}, ${q(sub.name)}, ${q(cat.name)}, true);`,
      );
      stmts.push(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES (${q(`precio-${productoId}`)}, ${q(productoId)}, ${q(PUESTO_ID)}, ${basePrice}, ${q(FECHA_PRECIO)}, true);`,
      );
      totalProductos++;

      // Modificador para sizes (cuando producto.price es null O cuando hay sizes con precios distintos)
      if (Array.isArray(prod.sizes) && prod.sizes.length > 0) {
        // Si todos los sizes son iguales al base no tiene sentido el modificador.
        const someDiff = prod.sizes.some((s) => s.price !== basePrice);
        if (someDiff || prod.sizes.length > 1) {
          const modNombre = prod.sizes.length === 2 && prod.sizes.every((s) => /^(Fría|Frapeada|Caliente|A las Rocas)$/.test(s.name))
            ? "Estilo"
            : "Tamaño";
          const modId = emitModificador(productoId, modNombre, true, false, null, null);
          totalModificadores++;
          prod.sizes
            .slice()
            .sort((a, b) => a.price - b.price)
            .forEach((s, i) => {
              const extra = s.price - basePrice;
              const label = s.includes ? `${s.name} (${s.includes})` : s.name;
              emitModificadorOpcion(modId, label, extra, i + 1);
              totalOpciones++;
            });
        }
      }

      // Modificadores para options (cada option es un grupo)
      if (Array.isArray(prod.options)) {
        for (const opt of prod.options) {
          const minSel = opt.min_select ?? (opt.required ? 1 : 0);
          const maxSel = opt.max_select ?? 1;
          const obligatorio = !!opt.required;
          const multiple = maxSel > 1;
          const modId = emitModificador(
            productoId,
            opt.name,
            obligatorio,
            multiple,
            multiple ? minSel : null,
            multiple ? maxSel : maxSel,
          );
          totalModificadores++;
          (opt.choices || []).forEach((c, i) => {
            emitModificadorOpcion(modId, c.name, c.price_modifier ?? 0, i + 1);
            totalOpciones++;
          });
        }
      }

      // Modificadores de tipo "agregar / extras" (modifiers)
      if (Array.isArray(prod.modifiers) && prod.modifiers.length > 0) {
        const modId = emitModificador(productoId, "Extras (opcional)", false, true, null, null);
        totalModificadores++;
        prod.modifiers.forEach((m, i) => {
          emitModificadorOpcion(modId, m.name, m.price ?? 0, i + 1);
          totalOpciones++;
        });
      }
    }
  }
}

// Wrap en transacción
console.log("BEGIN;");
for (const s of stmts) console.log(s);
console.log("COMMIT;");
console.error(
  `\nResumen: ${totalProductos} productos, ${totalModificadores} grupos de modificadores, ${totalOpciones} opciones`,
);
