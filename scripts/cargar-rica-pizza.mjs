#!/usr/bin/env node
// Carga el catálogo de Rica Pizza (Sahuayo). Tel del dueño 3535325644.
// "¡Simplemente la mejor!" desde 1993.
//
// === MENÚ NUEVO (reemplaza el catálogo viejo) ===
// Modelo:
//   - 28 "Pizza [Sabor]" como productos con 4 variantes de tamaño
//     (Chica/Mediana/Grande/Extra Grande). Precio base = chica;
//     mediana/grande/extra usan `precio_extra` por valor de tamaño.
//     Se agrupan en 3 subsecciones según el menú/precio:
//       · "1 Ingrediente"  (8 pizzas)   105 / 132 / 178 / 220
//       · "2 Ingredientes" (11 pizzas)  120 / 150 / 198 / 245
//       · "Especialidades" (9 pizzas)   precio variable por pizza
//   - 1 "Rebanada de Pizza" (precio fijo $32, sin variantes).
//   - 1 "Pizza Individual" con 3 variantes (1-2 ingr / 3 ingr / Especial)
//     + modificador opcional "Doble queso" $12.
//   - Sección "Comida" (11 platillos) y "Bebidas" (9 productos).
//   - El "doble queso" de pizza entera (precio variable por tamaño:
//     +$40/$50/$60/$70) NO se modela como modificador — su precio depende
//     del tamaño elegido, lo cual no soporta nuestro modelo simple de
//     modificadores. Queda como nota visible en la descripción.
//
// Correcciones de captura aplicadas al JSON de origen:
//   - "Mexinana" → "Mexicana"
//   - "Peperoni" → "Pepperoni"
//
// Horario: 12:30 a 22:00 todos los días. (El menú nota "abierto todos los
// días del año excepto Viernes Santo"; eso se maneja manualmente ese día.)
//
// Al final reactiva la tienda (puestos.activo = true) porque estaba pausada
// únicamente por tener el menú viejo cargado.
//
// Uso (desde el host del VPS o vía ssh, dentro de la red docker):
//   DATABASE_URL=postgresql://... node scripts/cargar-rica-pizza.mjs
//
// Idempotente: borra productos `rica-pizza-%` previos antes de insertar.

import pg from "pg";
import crypto from "node:crypto";
const { Pool } = pg;

const PUESTO_ID = "puesto-f8b87eed";
const FECHA = new Date().toISOString().slice(0, 10);
const SECCION_ENTERAS = "Pizzas";
const SECCION_REBANADA = "Rebanada";
const SECCION_INDIVIDUALES = "Pizza individual";
const SECCION_COMIDA = "Comida";
const SECCION_BEBIDAS = "Bebidas";

const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  abre: "12:30",
  cierra: "22:00",
}));

// Variantes de tamaño para pizzas enteras. La primera ("Chica") usa el
// precio base del producto; las demás usan `precio_extra`.
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

// 28 pizzas enteras. precio = [chica, mediana, grande, extra_gde].
// `sub` = subsección, `d` = descripción opcional (ingredientes / notas).
const PIZZAS = [
  // ── 1 Ingrediente — 105 / 132 / 178 / 220 ──
  { n: "Queso", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Piña", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Salchicha", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Chorizo", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Cebolla", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Jamón", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Salami", p: [105, 132, 178, 220], sub: "1 Ingrediente" },
  { n: "Champiñón", p: [105, 132, 178, 220], sub: "1 Ingrediente" },

  // ── 2 Ingredientes — 120 / 150 / 198 / 245 ──
  { n: "Tocino", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Atún", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Jamón y Piña", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Mexicana", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Jamón y Champiñón", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Jamón y Salami", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Salami y Piña", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Champiñón y Pimiento", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Pollo", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Salami y Champiñón", p: [120, 150, 198, 245], sub: "2 Ingredientes" },
  { n: "Pepperoni", p: [120, 150, 198, 245], sub: "2 Ingredientes" },

  // ── Especialidades — precio variable ──
  {
    n: "Salami, Champiñón y Pimiento",
    p: [135, 168, 218, 270],
    sub: "Especialidades",
  },
  {
    n: "Jamón, Salami y Champiñón",
    p: [135, 168, 218, 270],
    sub: "Especialidades",
  },
  {
    n: "Vegetariana",
    d: "Champiñón, piña y morrón.",
    p: [135, 168, 218, 270],
    sub: "Especialidades",
  },
  {
    n: "Carnes Frías",
    d: "Jamón, salami y salchicha.",
    p: [135, 168, 218, 270],
    sub: "Especialidades",
  },
  {
    n: "Salami, Champiñón y Tocino",
    p: [150, 186, 238, 295],
    sub: "Especialidades",
  },
  {
    n: "Italiana",
    d: "Salami, champiñón, pimiento y cebolla.",
    p: [150, 186, 238, 295],
    sub: "Especialidades",
  },
  {
    n: "Camarón",
    d: "Disponible solo en sucursal Villa.",
    p: [160, 200, 250, 310],
    sub: "Especialidades",
  },
  {
    n: "Especial de la Casa",
    d: "Jamón, salami, salchicha, piña, chorizo, morrón y champiñón.",
    p: [160, 200, 250, 310],
    sub: "Especialidades",
  },
  {
    n: "Pizza al Pastor",
    p: [160, 200, 250, 310],
    sub: "Especialidades",
  },
];

// 3 opciones de pizza individual — precio fijo por opción (sin tamaño).
const INDIVIDUALES = [
  { variante: "1 o 2 Ingredientes", precio: 62 },
  { variante: "3 Ingredientes", precio: 70 },
  { variante: "Especial", precio: 85 },
];

// Comida — productos simples (sin variantes).
const COMIDA = [
  { n: "Enchiladas Suizas", precio: 115, u: "orden" },
  { n: "Quesadillas", precio: 75, u: "orden" },
  { n: "Sincronizada con Papas", precio: 75, u: "orden" },
  { n: "Hamburguesa con Papas y Queso", precio: 85, u: "pieza" },
  { n: "Hamburguesa Doble Carne", precio: 115, u: "pieza" },
  {
    n: "Hamburguesa Especial",
    d: "Doble carne, tocino y queso.",
    precio: 150,
    u: "pieza",
  },
  { n: "Queso Fundido al Natural", precio: 90, u: "orden" },
  { n: "Chori-Queso", precio: 120, u: "orden" },
  { n: "Champi-Queso", precio: 120, u: "orden" },
  {
    n: "Queso Fundido Mixto",
    d: "Chorizo y champiñón.",
    precio: 140,
    u: "orden",
  },
  { n: "Papas a la Francesa", precio: 30, u: "orden" },
];

// Bebidas — productos simples. "Agua de Sabor" lleva modificador de sabor.
const BEBIDAS = [
  { n: "Refresco", precio: 25, u: "botella" },
  { n: "Refresco 2 Litros", precio: 55, u: "botella" },
  { n: "Refresco 3 Litros", precio: 65, u: "botella" },
  { n: "Agua 1 Litro", precio: 25, u: "botella" },
  { n: "Agua 1/2 Litro", precio: 15, u: "botella" },
  { n: "Jugo Grande", precio: 25, u: "vaso" },
  { n: "Jugo Chico", precio: 15, u: "vaso" },
  {
    n: "Agua de Sabor",
    precio: 25,
    u: "vaso",
    sabores: ["Tamarindo", "Guayaba", "Jamaica", "Lima", "Horchata"],
  },
  { n: "Cerveza", precio: 35, u: "botella" },
];

const NOTA_DOBLE_QUESO =
  "💡 Doble queso disponible: +$40 Chica · +$50 Mediana · +$60 Grande · +$70 Extra Grande. Indícalo en notas del pedido.";

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

    // 2) Limpiar el catálogo rica-pizza-% SIN borrar los productos: algunos
    //    están referenciados por pedido_items (historial) y no se pueden
    //    eliminar (FK ON DELETE NO ACTION). En su lugar:
    //      a) Borramos precios (nada referencia a precios) y toda la
    //         estructura de opciones/variantes/modificadores/horarios/días;
    //         se reconstruye desde cero más abajo. Los nietos (valores de
    //         opción, variante_valores, opciones de modificador) caen en
    //         cascada al borrar su padre.
    //      b) Los productos se hacen UPSERT (ver insertarSimple).
    //      c) Al final, los rica-pizza-% que ya no están en el menú nuevo se
    //         marcan disponible = false (paso 9).
    await c.query("DELETE FROM precios WHERE producto_id LIKE 'rica-pizza-%'");
    for (const tabla of [
      "producto_opciones",
      "producto_variantes",
      "producto_modificadores",
      "producto_dias",
      "producto_horarios",
    ]) {
      await c.query(
        `DELETE FROM ${tabla} WHERE producto_id LIKE 'rica-pizza-%'`
      );
    }

    // Ids del menú nuevo — para ocultar al final lo que ya no existe.
    const nuevosIds = [];

    // Helper: upsert de un producto simple + su precio base. Devuelve el id.
    async function insertarSimple({ id, nombre, unidad, desc, seccion, sub, precio }) {
      await c.query(
        `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, subseccion, disponible)
         VALUES ($1, $2, 'pizzas', $3, $4, $5, $6, true)
         ON CONFLICT (id) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           categoria_id = EXCLUDED.categoria_id,
           unidad = EXCLUDED.unidad,
           descripcion = EXCLUDED.descripcion,
           seccion = EXCLUDED.seccion,
           subseccion = EXCLUDED.subseccion,
           disponible = true`,
        [id, nombre, unidad, desc ?? null, seccion, sub ?? null]
      );
      await c.query(
        `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id.replace("rica-pizza-", "rica-precio-"), id, PUESTO_ID, precio, FECHA]
      );
      nuevosIds.push(id);
      return id;
    }

    // 3) Insertar 28 pizzas enteras. Modelo (igual que Break Pizza):
    //    - precio base = precio Chica
    //    - opción "Tamaño" con 4 valores, cada uno con `precio_extra` =
    //      diferencia respecto a chica
    //    - 4 variantes con `valor_ids` apuntando al valor correspondiente
    //    El frontend usa `opciones` para renderizar el selector — con solo
    //    variantes sin opción/valores, no muestra modal y agrega el primer
    //    precio que encuentre.
    let countPizzas = 0;
    for (const pz of PIZZAS) {
      const id = "rica-pizza-" + slug(pz.n);
      const desc = pz.d ? `${pz.d} · ${NOTA_DOBLE_QUESO}` : NOTA_DOBLE_QUESO;

      await insertarSimple({
        id,
        nombre: `Pizza ${pz.n}`,
        unidad: "pieza",
        desc,
        seccion: SECCION_ENTERAS,
        sub: pz.sub,
        precio: pz.p[0], // base = chica
      });

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
        await c.query(
          `INSERT INTO variante_valores (variante_id, valor_id)
           VALUES ($1, $2)`,
          [varId, valorIds[i]]
        );
      }
      countPizzas++;
    }

    // 4) Rebanada — producto simple sin variantes. $32.
    await insertarSimple({
      id: "rica-pizza-rebanada",
      nombre: "Rebanada de Pizza",
      unidad: "rebanada",
      desc: "Una rebanada del día. Sabor según disponibilidad.",
      seccion: SECCION_REBANADA,
      precio: 32,
    });

    // 5) Pizza Individual — 1 producto con opción "Ingredientes" (3 valores)
    //    y modificador "Doble queso" $12.
    {
      const id = "rica-pizza-individual";
      await insertarSimple({
        id,
        nombre: "Pizza Individual",
        unidad: "pieza",
        desc: "Pizza pequeña personal. Elige cantidad de ingredientes.",
        seccion: SECCION_INDIVIDUALES,
        precio: INDIVIDUALES[0].precio, // base = 1 o 2 ingredientes
      });

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

      // Modificador opcional: doble queso $12 — fijo, sin tamaño.
      const modId = crypto.randomUUID();
      await c.query(
        `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden)
         VALUES ($1, $2, 'Extras', false, false, 0, 1, 1)`,
        [modId, id]
      );
      await c.query(
        `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden)
         VALUES ($1, $2, 'Doble queso', 12, 1)`,
        [crypto.randomUUID(), modId]
      );
    }

    // 6) Comida — productos simples.
    let countComida = 0;
    for (const it of COMIDA) {
      await insertarSimple({
        id: "rica-pizza-com-" + slug(it.n),
        nombre: it.n,
        unidad: it.u,
        desc: it.d ?? null,
        seccion: SECCION_COMIDA,
        precio: it.precio,
      });
      countComida++;
    }

    // 7) Bebidas — productos simples. "Agua de Sabor" lleva modificador
    //    obligatorio "Sabor" (single-select, sin costo extra).
    let countBebidas = 0;
    for (const it of BEBIDAS) {
      const id = "rica-pizza-beb-" + slug(it.n);
      await insertarSimple({
        id,
        nombre: it.n,
        unidad: it.u,
        desc: it.sabores ? `Sabores: ${it.sabores.join(", ")}.` : null,
        seccion: SECCION_BEBIDAS,
        precio: it.precio,
      });

      if (it.sabores) {
        const modId = crypto.randomUUID();
        await c.query(
          `INSERT INTO producto_modificadores (id, producto_id, nombre, obligatorio, multiple, minimo, maximo, orden)
           VALUES ($1, $2, 'Sabor', true, false, 1, 1, 1)`,
          [modId, id]
        );
        for (let i = 0; i < it.sabores.length; i++) {
          await c.query(
            `INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden)
             VALUES ($1, $2, $3, 0, $4)`,
            [crypto.randomUUID(), modId, it.sabores[i], i]
          );
        }
      }
      countBebidas++;
    }

    // 9) Ocultar los rica-pizza-% que ya no están en el menú nuevo. No se
    //    pueden borrar (historial de pedidos), así que se marcan no
    //    disponibles para que desaparezcan del menú del cliente.
    const ocultados = await c.query(
      `UPDATE productos SET disponible = false
       WHERE id LIKE 'rica-pizza-%' AND NOT (id = ANY($1)) RETURNING id`,
      [nuevosIds]
    );

    // 10) Reactivar la tienda — estaba pausada solo por el menú viejo.
    //    Para que vuelva a aparecer al cliente, GET /api/productos exige
    //    activo = true AND aprobado = true; reactivamos ambos y, como hace
    //    la aprobación de tiendas, el usuario 'tienda' del puesto.
    await c.query(
      "UPDATE puestos SET activo = true, aprobado = true WHERE id = $1",
      [PUESTO_ID]
    );
    await c.query(
      "UPDATE usuarios SET activo = true WHERE puesto_id = $1 AND rol = 'tienda'",
      [PUESTO_ID]
    );

    await c.query("COMMIT");

    console.log(`✅ Rica Pizza listo en ${PUESTO_ID}`);
    console.log(`   • Horario: 12:30–22:00 (7 días)`);
    console.log(`   • ${countPizzas} pizzas enteras (× 4 tamaños) cargadas`);
    console.log(`   • Rebanada $32`);
    console.log(`   • Pizza individual (3 variantes) + doble queso $12`);
    console.log(`   • ${countComida} platillos de comida`);
    console.log(`   • ${countBebidas} bebidas`);
    console.log(`   • ${ocultados.rowCount} productos viejos ocultados (historial)`);
    console.log(`   • Tienda reactivada (activo = true, aprobado = true)`);
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
