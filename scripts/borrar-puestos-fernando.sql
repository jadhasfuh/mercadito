-- Borrado definitivo de las 5 cuentas que trabajaba Fernando y que el negocio
-- nunca actualizó (ago 2026): La Ventanita, Similares, Hacienda de Chaguas,
-- Rica Pizza y Subway.
--
-- ES IRREVERSIBLE. Corre los tres pasos EN ORDEN y revisa el paso 1 antes de
-- seguir. El paso 2 deja tablas de respaldo dentro de la misma base: son la
-- única forma de recuperar algo si algo sale mal.
--
-- Ojo con los pedidos MIXTOS (con productos de estas tiendas y de otras): no
-- se borran, solo pierden las líneas de estas tiendas, y se les recalcula el
-- total para que la contabilidad siga cuadrando.
--
-- Uso: Supabase → SQL Editor, un paso a la vez.

-- ═══════════════════════════════════════════════════════════════════
-- PASO 1 — DIAGNÓSTICO (no borra nada). Revisa estos números primero.
-- ═══════════════════════════════════════════════════════════════════
WITH objetivo AS (
  SELECT id, nombre FROM puestos WHERE nombre IN (
    'Cremeria La Ventanita', 'Farmacias Similares',
    'La Hacienda De Chaguas', 'Rica Pizza', 'Subway'
  )
)
SELECT
  (SELECT count(*) FROM objetivo)                                              AS puestos,
  (SELECT count(*) FROM usuarios  WHERE puesto_id IN (SELECT id FROM objetivo)) AS usuarios,
  (SELECT count(*) FROM precios   WHERE puesto_id IN (SELECT id FROM objetivo)) AS precios,
  (SELECT count(*) FROM pedido_items WHERE puesto_id IN (SELECT id FROM objetivo)) AS lineas_pedido,
  -- Pedidos que SOLO tienen productos de estas tiendas → se borran completos
  (SELECT count(*) FROM (
     SELECT pedido_id FROM pedido_items GROUP BY pedido_id
     HAVING bool_and(puesto_id IN (SELECT id FROM objetivo))
   ) x)                                                                        AS pedidos_a_borrar,
  -- Pedidos MIXTOS → sobreviven, pierden líneas y se recalcula su total
  (SELECT count(*) FROM (
     SELECT pedido_id FROM pedido_items GROUP BY pedido_id
     HAVING bool_or(puesto_id IN (SELECT id FROM objetivo))
        AND bool_or(puesto_id NOT IN (SELECT id FROM objetivo))
   ) y)                                                                        AS pedidos_mixtos,
  (SELECT count(*) FROM ingresos_manuales WHERE puesto_id IN (SELECT id FROM objetivo)) AS ingresos_manuales,
  (SELECT count(*) FROM mensajes WHERE para_puesto_id IN (SELECT id FROM objetivo))     AS mensajes;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 2 — RESPALDO. Copia lo que se va a borrar a tablas nuevas.
-- Bórralas tú mismo (DROP TABLE respaldo_fer_*) cuando estés seguro.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE respaldo_fer_puestos AS
  SELECT * FROM puestos WHERE nombre IN (
    'Cremeria La Ventanita', 'Farmacias Similares',
    'La Hacienda De Chaguas', 'Rica Pizza', 'Subway');

CREATE TABLE respaldo_fer_usuarios AS
  SELECT * FROM usuarios WHERE puesto_id IN (SELECT id FROM respaldo_fer_puestos);

CREATE TABLE respaldo_fer_precios AS
  SELECT * FROM precios WHERE puesto_id IN (SELECT id FROM respaldo_fer_puestos);

CREATE TABLE respaldo_fer_pedido_items AS
  SELECT * FROM pedido_items WHERE puesto_id IN (SELECT id FROM respaldo_fer_puestos);

CREATE TABLE respaldo_fer_pedidos AS
  SELECT * FROM pedidos WHERE id IN (SELECT DISTINCT pedido_id FROM respaldo_fer_pedido_items);


-- ═══════════════════════════════════════════════════════════════════
-- PASO 3 — BORRADO. Todo en una transacción: o pasa completo o nada.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE _obj AS SELECT id FROM respaldo_fer_puestos;

-- Pedidos que quedan vacíos al quitar estas tiendas → se van completos.
CREATE TEMP TABLE _pedidos_solo AS
  SELECT pedido_id FROM pedido_items
  GROUP BY pedido_id
  HAVING bool_and(puesto_id IN (SELECT id FROM _obj));

-- Pedidos mixtos → sobreviven; guardamos cuáles para recalcularles el total.
CREATE TEMP TABLE _pedidos_mixtos AS
  SELECT pedido_id FROM pedido_items
  GROUP BY pedido_id
  HAVING bool_or(puesto_id IN (SELECT id FROM _obj))
     AND bool_or(puesto_id NOT IN (SELECT id FROM _obj));

-- 3.1 Dependencias de los pedidos que se van completos
DELETE FROM repartidor_movimientos WHERE pedido_id IN (SELECT pedido_id FROM _pedidos_solo);

-- 3.2 Todas las líneas de estas tiendas (de pedidos completos y mixtos)
DELETE FROM pedido_items WHERE puesto_id IN (SELECT id FROM _obj);

-- 3.3 Los pedidos que quedaron sin líneas
DELETE FROM pedidos WHERE id IN (SELECT pedido_id FROM _pedidos_solo);

-- 3.4 Recalcular el total de los mixtos con lo que les quedó. Sin esto, el
--     pedido diría un total que no corresponde a sus productos.
UPDATE pedidos p
   SET subtotal = COALESCE(s.suma, 0),
       total    = COALESCE(s.suma, 0) + COALESCE(p.costo_envio, 0)
  FROM (SELECT pedido_id, SUM(subtotal) AS suma FROM pedido_items GROUP BY pedido_id) s
 WHERE p.id = s.pedido_id
   AND p.id IN (SELECT pedido_id FROM _pedidos_mixtos);

-- 3.5 Resto de referencias que bloquean el borrado del puesto
DELETE FROM mensajes           WHERE para_puesto_id IN (SELECT id FROM _obj);
DELETE FROM ingresos_manuales  WHERE puesto_id      IN (SELECT id FROM _obj);
DELETE FROM puesto_categorias  WHERE puesto_id      IN (SELECT id FROM _obj);
DELETE FROM precios            WHERE puesto_id      IN (SELECT id FROM _obj);
UPDATE pedidos SET solicitado_por_tienda_id = NULL
 WHERE solicitado_por_tienda_id IN (SELECT id FROM _obj);
DELETE FROM usuarios           WHERE puesto_id      IN (SELECT id FROM _obj);

-- 3.6 Y por fin los puestos. Lo que cuelga con ON DELETE CASCADE (mesas,
--     cuentas, citas, servicios, horarios, chat) se va solo.
DELETE FROM puestos WHERE id IN (SELECT id FROM _obj);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- COMPROBACIÓN (después del COMMIT). Debe devolver 0 filas.
-- ═══════════════════════════════════════════════════════════════════
-- SELECT nombre FROM puestos WHERE nombre IN (
--   'Cremeria La Ventanita','Farmacias Similares',
--   'La Hacienda De Chaguas','Rica Pizza','Subway');

-- Productos que quedaron sin precio en NINGUNA tienda. No se borran aquí
-- porque `productos` es compartido entre negocios: si otro los vende, el
-- borrado se lo llevaría de paso. Quedan invisibles y no estorban.
-- SELECT count(*) FROM productos p
--  WHERE NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id);
