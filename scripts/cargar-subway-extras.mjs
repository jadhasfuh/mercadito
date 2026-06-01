#!/usr/bin/env node
// Completa el menú de Subway (puesto-5bbd2edd):
//   1) Agrega 2 footlong faltantes — Costillas BBQ ($160) y Pollo ($145) —
//      que existían en 15 cm pero no en 30 cm. Copian la foto de su versión
//      de 15 cm.
//   2) Agrega a CADA sub el modificador "Extras" (Queso, Tocino, Guacamole,
//      Cebollitas Crujientes, X-Tremo) con precio según tamaño (15cm o
//      footlong), opcional y de selección múltiple.
//   3) Agrega a cada sub el modificador "Combo" (Supercrunch +$50: bebida
//      600 ml + galleta + papas Sabritas), opcional, selección única.
//
// Subway modela cada tamaño como producto independiente
// (categoria_id = comida_rapida, unidad = porcion, seccion = Subway,
//  subseccion = Sub15cm / Sub30cm). Los precios viven en `precios`.
//
// Idempotente: hace upsert de los footlong y borra/recrea los
// modificadores "Extras" y "Combo" de cada sub en cada corrida.
//
// Uso (dentro de la red docker del VPS):
//   docker exec -w /app mercadito node cargar-subway-extras.mjs

import pg from "pg";
import crypto from "node:crypto";
const { Pool } = pg;

const PUESTO_ID = "puesto-5bbd2edd";
const FECHA = new Date().toISOString().slice(0, 10);

// Footlong faltantes. `imgFrom` = id del producto de 15 cm cuya foto se copia.
const FOOTLONGS = [
  {
    id: "sub-costillas-bbq-footlong-30-cm",
    nombre: "Sub costillas Bbq footlong 30 cm",
    precio: 160,
    imgFrom: "sub-costillas-bbq-15-cm-31ec",
  },
  {
    id: "sub-pollo-footlong-30-cm",
    nombre: "Sub pollo footlong 30 cm",
    precio: 145,
    imgFrom: "sub-pollo-15-cm-811b",
  },
];

// Extras — precio por tamaño (15 cm / footlong).
const EXTRAS = [
  { n: "Queso", p15: 18, pf: 28 },
  { n: "Tocino", p15: 25, pf: 38 },
  { n: "Guacamole", p15: 23, pf: 28 },
  { n: "Cebollitas Crujientes", p15: 18, pf: 28 },
  { n: "X-Tremo", p15: 36, pf: 60 },
];

const COMBO_NOMBRE = "Supercrunch — bebida 600 ml + galleta + papas Sabritas";
const COMBO_PRECIO = 50;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://n8n_user:Hususeza1@n8n-postgres-1:5432/mercadito",
});

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1) Footlong faltantes — upsert producto + precio (copiando la foto).
    for (const f of FOOTLONGS) {
      const img = await c.query("SELECT imagen FROM productos WHERE id = $1", [
        f.imgFrom,
      ]);
      const imagen = img.rows[0]?.imagen ?? null;

      await c.query(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, seccion, subseccion, disponible, imagen)
         VALUES ($1, $2, 'comida_rapida', 'porcion', 'Subway', 'Sub30cm', true, $3)
         ON CONFLICT (id) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           categoria_id = EXCLUDED.categoria_id,
           unidad = EXCLUDED.unidad,
           seccion = EXCLUDED.seccion,
           subseccion = EXCLUDED.subseccion,
           disponible = true,
           imagen = COALESCE(productos.imagen, EXCLUDED.imagen)`,
        [f.id, f.nombre, imagen]
      );

      await c.query(
        "DELETE FROM precios WHERE producto_id = $1 AND puesto_id = $2",
        [f.id, PUESTO_ID]
      );
      await c.query(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [`sub-precio-${f.id}`, f.id, PUESTO_ID, f.precio, FECHA]
      );
    }

    // 2) Lista de todos los subs de este puesto (ya incluye los 2 nuevos).
    const subs = await c.query(
      `SELECT id, subseccion FROM productos
       WHERE id IN (SELECT producto_id FROM precios WHERE puesto_id = $1)`,
      [PUESTO_ID]
    );

    // 3) Recrear modificadores "Extras" y "Combo" en cada sub.
    let nExtras = 0;
    let nCombo = 0;
    for (const sub of subs.rows) {
      const esFootlong = sub.subseccion === "Sub30cm";

      // Borrar los modificadores previos (sus opciones caen en cascada).
      await c.query(
        "DELETE FROM producto_modificadores WHERE producto_id = $1 AND nombre IN ('Extras', 'Combo')",
        [sub.id]
      );

      // Extras — opcional, múltiple (hasta los 5 extras).
      const extrasId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden)
         VALUES ($1, $2, 'Extras', false, true, 0, $3, 1)`,
        [extrasId, sub.id, EXTRAS.length]
      );
      for (let i = 0; i < EXTRAS.length; i++) {
        const e = EXTRAS[i];
        await c.query(
          `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden)
           VALUES ($1, $2, $3, $4, $5)`,
          [crypto.randomUUID(), extrasId, e.n, esFootlong ? e.pf : e.p15, i]
        );
      }
      nExtras++;

      // Combo — opcional, selección única.
      const comboId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden)
         VALUES ($1, $2, 'Combo', false, false, 0, 1, 2)`,
        [comboId, sub.id]
      );
      await c.query(
        `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden)
         VALUES ($1, $2, $3, $4, 1)`,
        [crypto.randomUUID(), comboId, COMBO_NOMBRE, COMBO_PRECIO]
      );
      nCombo++;
    }

    await c.query("COMMIT");

    console.log(`✅ Subway completado en ${PUESTO_ID}`);
    console.log(`   • ${FOOTLONGS.length} footlong agregados (Costillas BBQ, Pollo)`);
    console.log(`   • Extras agregados a ${nExtras} subs`);
    console.log(`   • Combo Supercrunch (+$${COMBO_PRECIO}) agregado a ${nCombo} subs`);
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
