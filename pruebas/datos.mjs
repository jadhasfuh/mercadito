import pg from "pg";
import bcrypt from "bcryptjs";

/**
 * Datos de partida de la suite: un negocio con dos productos, su dueño y un
 * mesero. Se escriben con SQL directo y no por la API porque son el ANDAMIO,
 * no lo que se está probando — si el alta de tiendas se rompe, las pruebas de
 * caja tienen que seguir diciendo si la caja funciona.
 */

const URL = process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:55432/mercadito_test";

export const pool = new pg.Pool({ connectionString: URL });

export const IDS = {
  puesto: "puesto-pruebas",
  duenoTel: "5550000001",
  meseroTel: "5550000002",
  pin: "424242",
  prodA: "prod-pruebas-a",   // $100
  prodB: "prod-pruebas-b",   // $50
};

export async function sembrar() {
  const hash = await bcrypt.hash(IDS.pin, 10);

  // Idempotente: la suite se corre muchas veces contra la misma base. Las
  // sesiones de la corrida anterior apuntan a estos usuarios, así que van
  // primero o el DELETE choca contra la llave foránea.
  await pool.query(
    "DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE puesto_id = $1)",
    [IDS.puesto]
  );
  await pool.query("DELETE FROM usuarios WHERE puesto_id = $1", [IDS.puesto]);
  await limpiarMovimientos();
  // El orden importa: todo lo que apunta al puesto va antes que el puesto.
  await pool.query("DELETE FROM mesas WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM precios WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM puesto_horario_atencion WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM puesto_categorias WHERE puesto_id = $1", [IDS.puesto]).catch(() => {});
  await pool.query("DELETE FROM puestos WHERE id = $1", [IDS.puesto]);

  await pool.query(
    `INSERT INTO puestos (id, nombre, descripcion, ubicacion, activo, aprobado,
                          telefono_contacto, lat, lng, ciudad, suscripcion_hasta,
                          menu_publico, dine_in_activo, metodos_pago, servicios_pedido)
     VALUES ($1, 'Taquería de Pruebas', 'Cocina de humo y masa de nixtamal, sin conservadores, todos los días desde 1998',
             'Morelos 218, Centro', true, true, '3531234567', 20.05, -102.71, 'sahuayo',
             NOW() + INTERVAL '30 days', true, true, '["efectivo","tarjeta"]'::jsonb, '["local","llevar"]'::jsonb)`,
    [IDS.puesto]
  );

  // Horario: lunes a sábado 08:00–22:00, domingo cerrado. Alimenta la ficha.
  await pool.query("DELETE FROM puesto_horario_atencion WHERE puesto_id = $1", [IDS.puesto]);
  for (let d = 1; d <= 6; d++) {
    await pool.query(
      "INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES ($1, $2, '08:00', '22:00')",
      [IDS.puesto, d]
    );
  }

  await pool.query(
    `INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo)
     VALUES ('u-dueno-pruebas', 'Dueño Prueba', $1, $2, 'tienda', $3, true),
            ('u-mesero-pruebas', 'Mesero Prueba', $4, $2, 'mesero', $3, true)`,
    [IDS.duenoTel, hash, IDS.puesto, IDS.meseroTel]
  );

  for (const [id, nombre, precio] of [[IDS.prodA, "Taco de asada", 100], [IDS.prodB, "Agua de horchata", 50]]) {
    await pool.query("DELETE FROM precios WHERE producto_id = $1", [id]);
    await pool.query("DELETE FROM productos WHERE id = $1", [id]);
    await pool.query(
      `INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, subseccion, disponible)
       VALUES ($1, $2, 'antojitos', 'pieza', 'Descripción de prueba', 'Tacos', 'Para comer', true)`,
      [id, nombre]
    );
    await pool.query(
      `INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, true)`,
      [`precio-${id}`, id, IDS.puesto, precio]
    );
  }
}

/** Deja el negocio como recién sembrado, sin borrar el catálogo: cada bloque
 *  de pruebas arranca sin turnos abiertos ni ventas de la anterior. */
export async function limpiarMovimientos() {
  await pool.query("DELETE FROM caja_movimientos WHERE turno_id IN (SELECT id FROM caja_turnos WHERE puesto_id = $1)", [IDS.puesto]);
  await pool.query("DELETE FROM pedido_items WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM pedidos WHERE cuenta_id IN (SELECT id FROM cuentas WHERE puesto_id = $1)", [IDS.puesto]);
  await pool.query("DELETE FROM cuentas WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM caja_turnos WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("DELETE FROM menu_ventas WHERE puesto_id = $1", [IDS.puesto]);
  await pool.query("UPDATE puestos SET folio_actual = 0, menu_vistas = 0, menu_pedidos = 0 WHERE id = $1", [IDS.puesto]);
  await quitarPromos();
}

export async function quitarPromos() {
  await pool.query(
    `UPDATE precios SET precio_promo = NULL, promo_dias = NULL, promo_desde = NULL,
                        promo_hasta = NULL, promo_termina = NULL, promo_etiqueta = NULL
     WHERE puesto_id = $1`,
    [IDS.puesto]
  );
}

/** Día de la semana de hoy en hora de México — el mismo huso con el que el
 *  servidor evalúa si una promo aplica. Usar el día local del corredor haría
 *  que la prueba fallara sola cerca de la medianoche. */
export function diaHoyMX() {
  const enMx = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  return enMx.getDay();
}

export async function cerrar() {
  await pool.end();
}
