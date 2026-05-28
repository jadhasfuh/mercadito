#!/usr/bin/env node
// Carga el catálogo de Rica Pizza (Sahuayo). Tel del dueño 3535325644.
// "¡Simplemente la mejor!" desde 1993.
//
// Modelo:
//   - 29 "Pizza [Sabor]" como productos con 4 variantes (Chica/Mediana/
//     Grande/Extra Grande). Precio base = chica; mediana/grande/extra
//     usan `precio_override` por tamaño.
//   - 1 "Rebanada de Pizza" (precio fijo, sin variantes).
//   - 1 "Pizza Individual" con 3 variantes (1-2 ingr / 3 ingr / Especial)
//     + modificador opcional "Doble queso" $8.
//   - El "doble queso" de pizza entera (precio variable por tamaño) NO se
//     modela como modificador — su precio depende del tamaño elegido, lo
//     cual no soporta nuestro modelo simple de modificadores. Lo dejamos
//     en una nota visible en descripción.
//
// Horario: 12:30 a 22:00 todos los días.
//
// Uso (desde el host del VPS o vía ssh):
//   DATABASE_URL=postgresql://... node scripts/cargar-rica-pizza.mjs
//
// Idempotente: borra productos `rica-pizza-%` previos antes de insertar.

import pg from "pg";
import crypto from "node:crypto";
const { Pool } = pg;

const PUESTO_ID = "puesto-f8b87eed";
const FECHA = new Date().toISOString().slice(0, 10);
const SECCION_ENTERAS = "Pizzas enteras";
const SECCION_REBANADA = "Rebanada";
const SECCION_INDIVIDUALES = "Pizza individual";

const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  abre: "12:30",
  cierra: "22:00",
}));

// Variantes de tamaño para pizzas enteras. La primera ("Chica") usa el
// precio base del producto; las demás usan `precio_override`.
const TAMANOS = ["chica", "mediana", "grande", "extra_gde"];
const TAMANO_LABELS = {
  chica: "Chica",
  mediana: "Mediana",
  grande: "Grande",
  extra_gde: "Extra Grande",
};

// Slug helper — quita acentos y normaliza para usar como id.
function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 29 pizzas enteras del menú. precio = [chica, mediana, grande, extra_gde].
const PIZZAS = [
  { n: "Queso", p: [62, 78, 99, 140] },
  { n: "Piña", p: [70, 86, 112, 156] },
  { n: "Salchicha", p: [70, 86, 112, 156] },
  { n: "Chorizo", p: [70, 86, 112, 156] },
  { n: "Cebolla", p: [70, 86, 112, 156] },
  { n: "Tocino", p: [80, 99, 136, 156] },
  { n: "Atún", p: [80, 99, 136, 175] },
  { n: "Jamón", p: [70, 86, 112, 156] },
  { n: "Salami", p: [70, 86, 112, 156] },
  { n: "Champiñones", p: [70, 86, 112, 156] },
  { n: "Jamón y Piña", p: [80, 99, 136, 175] },
  { n: "Mexicana", p: [80, 99, 136, 175] },
  { n: "Jamón y Champiñón", p: [80, 99, 136, 175] },
  { n: "Jamón y Salami", p: [80, 99, 136, 175] },
  { n: "Salami y Piña", p: [80, 99, 136, 175] },
  { n: "Champiñón y Piña", p: [80, 99, 136, 175] },
  { n: "Salami y Pimiento", p: [80, 99, 136, 175] },
  { n: "Champiñón y Pimiento", p: [80, 99, 136, 175] },
  { n: "Pollo", p: [80, 99, 136, 175] },
  { n: "Salami y Champiñón", p: [80, 99, 136, 175] },
  { n: "Salami, Champiñón y Pimiento", p: [85, 114, 152, 195] },
  { n: "Jamón, Salami y Champiñón", p: [85, 114, 152, 195] },
  { n: "Salami, Champiñón y Tocino", p: [89, 129, 162, 210] },
  {
    n: "Especial de la Casa",
    d: "Jamón, salami, salchicha, piña, chorizo y pimiento.",
    p: [89, 129, 162, 210],
  },
  {
    n: "Especial con Champiñón",
    d: "Especial de la Casa + champiñones.",
    p: [95, 138, 178, 218],
  },
  { n: "Pepperoni", p: [80, 99, 136, 175] },
  { n: "Camarón", p: [89, 129, 162, 210] },
  {
    n: "Italiana",
    d: "Salami, champiñón, pimiento y cebolla.",
    p: [89, 129, 162, 210],
  },
  {
    n: "Vegetariana",
    d: "Champiñón, piña y morrón.",
    p: [85, 114, 152, 195],
  },
];

// 3 opciones de pizza individual — precio fijo por opción (sin tamaño).
const INDIVIDUALES = [
  { variante: "1 o 2 Ingredientes", precio: 35 },
  { variante: "3 Ingredientes", precio: 40 },
  { variante: "Especial", precio: 48 },
];

const NOTA_DOBLE_QUESO =
  "💡 Doble queso disponible: +$25 Chica · +$30 Mediana · +$40 Grande · +$50 Extra Grande. Indícalo en notas del pedido.";

// ────────────────────────────── main ──────────────────────────────

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://n8n_user:Hususeza1@n8n-postgres-1:5432/mercadito",
});

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1) Horario de atención — 12:30-22:00 todos los días.
    await c.query("DELETE FROM puesto_horario_atencion WHERE puesto_id = $1", [
      PUESTO_ID,
    ]);
    for (const h of HORARIO) {
      await c.query(
        "INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES ($1, $2, $3, $4)",
        [PUESTO_ID, h.dia, h.abre, h.cierra]
      );
    }

    // 2) Limpiar productos previos rica-pizza-% (idempotencia).
    //    Borramos precios primero porque tienen FK NOT NULL hacia productos.
    //    El resto (variantes, opciones, valores, modificadores, valores de
    //    variante) cae en cascada al borrar el producto.
    const prev = await c.query(
      "SELECT id FROM productos WHERE id LIKE 'rica-pizza-%'"
    );
    if (prev.rows.length > 0) {
      const ids = prev.rows.map((r) => r.id);
      await c.query("DELETE FROM precios WHERE producto_id = ANY($1)", [ids]);
      await c.query("DELETE FROM productos WHERE id = ANY($1)", [ids]);
    }

    // 3) Insertar 29 pizzas enteras. Modelo correcto (igual que Break Pizza):
    //    - precio base = precio Chica
    //    - opción "Tamaño" con 4 valores, cada uno con `precio_extra` =
    //      diferencia respecto a chica
    //    - 4 variantes con `valor_ids` apuntando al valor correspondiente
    //    El frontend usa `opciones` para renderizar el selector — con solo
    //    variantes sin opcion/valores, no muestra modal y agrega el primer
    //    precio que encuentre.
    let countPizzas = 0;
    for (const pz of PIZZAS) {
      const id = "rica-pizza-" + slug(pz.n);
      const desc = pz.d
        ? `${pz.d} · ${NOTA_DOBLE_QUESO}`
        : NOTA_DOBLE_QUESO;

      await c.query(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible)
         VALUES ($1, $2, 'pizzas', 'pieza', $3, $4, true)`,
        [id, `Pizza ${pz.n}`, desc, SECCION_ENTERAS]
      );

      // Precio base = chica.
      const precioId = `rica-precio-${slug(pz.n)}`;
      await c.query(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [precioId, id, PUESTO_ID, pz.p[0], FECHA]
      );

      // Opción "Tamaño" + 4 valores con precio_extra relativo a Chica.
      const opcionId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_opciones (id, producto_id, nombre, orden)
         VALUES ($1, $2, 'Tamaño', 0)`,
        [opcionId, id]
      );
      const valorIds = [];
      for (let i = 0; i < TAMANOS.length; i++) {
        const valorId = crypto.randomUUID();
        const precioExtra = pz.p[i] - pz.p[0]; // diferencia vs. chica
        await c.query(
          `INSERT INTO producto_opcion_valores (id, opcion_id, valor, precio_extra, orden)
           VALUES ($1, $2, $3, $4, $5)`,
          [valorId, opcionId, TAMANO_LABELS[TAMANOS[i]], precioExtra, i]
        );
        valorIds.push(valorId);
      }

      // 4 variantes, una por valor de tamaño.
      for (let i = 0; i < TAMANOS.length; i++) {
        const varId = crypto.randomUUID();
        await c.query(
          `INSERT INTO producto_variantes (id, producto_id, nombre, orden, activo)
           VALUES ($1, $2, $3, $4, true)`,
          [varId, id, TAMANO_LABELS[TAMANOS[i]], i]
        );
        // Tabla de unión variante ↔ valor de opción. En Break Pizza esta
        // tabla se llama `variante_valores`. Cada fila enlaza un valor a
        // su variante.
        await c.query(
          `INSERT INTO variante_valores (variante_id, valor_id)
           VALUES ($1, $2)`,
          [varId, valorIds[i]]
        );
      }
      countPizzas++;
    }

    // 4) Rebanada — producto simple sin variantes.
    {
      const id = "rica-pizza-rebanada";
      await c.query(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible)
         VALUES ($1, 'Rebanada de Pizza', 'pizzas', 'rebanada', 'Una rebanada del día. Sabor según disponibilidad.', $2, true)`,
        [id, SECCION_REBANADA]
      );
      await c.query(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
         VALUES ('rica-precio-rebanada', $1, $2, 22, $3, true)`,
        [id, PUESTO_ID, FECHA]
      );
    }

    // 5) Pizza Individual — 1 producto con opción "Ingredientes" (3 valores)
    //    y modificador "Doble queso" $8.
    {
      const id = "rica-pizza-individual";
      await c.query(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, disponible)
         VALUES ($1, 'Pizza Individual', 'pizzas', 'pieza',
                 'Pizza pequeña personal. Elige cantidad de ingredientes.', $2, true)`,
        [id, SECCION_INDIVIDUALES]
      );
      await c.query(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
         VALUES ('rica-precio-individual', $1, $2, $3, $4, true)`,
        [id, PUESTO_ID, INDIVIDUALES[0].precio, FECHA]
      );

      // Opción "Ingredientes" + 3 valores.
      const opcionId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_opciones (id, producto_id, nombre, orden)
         VALUES ($1, $2, 'Ingredientes', 0)`,
        [opcionId, id]
      );
      const valorIds = [];
      for (let i = 0; i < INDIVIDUALES.length; i++) {
        const valorId = crypto.randomUUID();
        const precioExtra = INDIVIDUALES[i].precio - INDIVIDUALES[0].precio;
        await c.query(
          `INSERT INTO producto_opcion_valores (id, opcion_id, valor, precio_extra, orden)
           VALUES ($1, $2, $3, $4, $5)`,
          [valorId, opcionId, INDIVIDUALES[i].variante, precioExtra, i]
        );
        valorIds.push(valorId);
      }
      for (let i = 0; i < INDIVIDUALES.length; i++) {
        const varId = crypto.randomUUID();
        await c.query(
          `INSERT INTO producto_variantes (id, producto_id, nombre, orden, activo)
           VALUES ($1, $2, $3, $4, true)`,
          [varId, id, INDIVIDUALES[i].variante, i]
        );
        await c.query(
          `INSERT INTO variante_valores (variante_id, valor_id) VALUES ($1, $2)`,
          [varId, valorIds[i]]
        );
      }

      // Modificador opcional: doble queso $8 — fijo, sin tamaño.
      const modId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden)
         VALUES ($1, $2, 'Extras', false, false, 0, 1, 1)`,
        [modId, id]
      );
      await c.query(
        `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden)
         VALUES ($1, $2, 'Doble queso', 8, 1)`,
        [crypto.randomUUID(), modId]
      );
    }

    await c.query("COMMIT");

    console.log(`✅ Rica Pizza listo en ${PUESTO_ID}`);
    console.log(`   • Horario: 12:30–22:00 (7 días)`);
    console.log(`   • ${countPizzas} pizzas enteras (× 4 tamaños) cargadas`);
    console.log(`   • Rebanada $22`);
    console.log(`   • Pizza individual (3 variantes) + doble queso $8`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("❌ Error:", e.message);
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
