-- Borrado definitivo de las 5 cuentas que trabajaba Fernando y que el negocio
-- nunca actualizó (ago 2026): La Ventanita, Similares, Hacienda de Chaguas,
-- Rica Pizza y Subway.
--
-- ES IRREVERSIBLE y sin respaldo (no había contabilidad que conservar).
--
-- Todo va en UNA transacción: si algo falla, no se borra nada. El orden
-- importa — hay 15 tablas que apuntan a `puestos` y 9 que apuntan a
-- `usuarios`, casi todas SIN cascade, así que hay que limpiarlas antes.
--
-- Uso: Supabase → SQL Editor. Pega todo y ejecuta.

BEGIN;

-- Los puestos y sus usuarios, congelados al inicio para que las referencias
-- no cambien a media transacción.
CREATE TEMP TABLE _obj AS
  SELECT id FROM puestos WHERE nombre IN (
    'Cremeria La Ventanita', 'Farmacias Similares',
    'La Hacienda De Chaguas', 'Rica Pizza', 'Subway');

CREATE TEMP TABLE _users AS
  SELECT id FROM usuarios WHERE puesto_id IN (SELECT id FROM _obj);

-- Pedidos que quedan vacíos al quitar estas tiendas → se van completos.
CREATE TEMP TABLE _pedidos_solo AS
  SELECT pedido_id FROM pedido_items
  GROUP BY pedido_id
  HAVING bool_and(puesto_id IN (SELECT id FROM _obj));

-- Pedidos MIXTOS (productos de estas tiendas y de otras) → sobreviven; les
-- recalculamos el total abajo o quedarían diciendo un monto que no
-- corresponde a los productos que les quedaron.
CREATE TEMP TABLE _pedidos_mixtos AS
  SELECT pedido_id FROM pedido_items
  GROUP BY pedido_id
  HAVING bool_or(puesto_id IN (SELECT id FROM _obj))
     AND bool_or(puesto_id NOT IN (SELECT id FROM _obj));

-- ── 1. Pedidos ──────────────────────────────────────────────────────
DELETE FROM repartidor_movimientos WHERE pedido_id IN (SELECT pedido_id FROM _pedidos_solo);
DELETE FROM pedido_items WHERE puesto_id IN (SELECT id FROM _obj);
DELETE FROM pedidos      WHERE id IN (SELECT pedido_id FROM _pedidos_solo);

UPDATE pedidos p
   SET subtotal = COALESCE(s.suma, 0),
       total    = COALESCE(s.suma, 0) + COALESCE(p.costo_envio, 0)
  FROM (SELECT pedido_id, SUM(subtotal) AS suma FROM pedido_items GROUP BY pedido_id) s
 WHERE p.id = s.pedido_id
   AND p.id IN (SELECT pedido_id FROM _pedidos_mixtos);

-- ── 2. Lo que cuelga del PUESTO sin cascade ─────────────────────────
DELETE FROM mensajes          WHERE para_puesto_id IN (SELECT id FROM _obj);
DELETE FROM ingresos_manuales WHERE puesto_id      IN (SELECT id FROM _obj);
DELETE FROM puesto_categorias WHERE puesto_id      IN (SELECT id FROM _obj);
DELETE FROM precios           WHERE puesto_id      IN (SELECT id FROM _obj);
UPDATE pedidos SET solicitado_por_tienda_id = NULL
 WHERE solicitado_por_tienda_id IN (SELECT id FROM _obj);

-- ── 3. Lo que cuelga de sus USUARIOS ────────────────────────────────
-- Estas cuentas son de tienda, pero nada impide que el dueño también haya
-- pedido como cliente o cobrado como repartidor. Lo que es suyo se borra;
-- lo que pertenece a OTRO (un pedido de otra tienda, un referido) solo
-- pierde la referencia, para no llevarnos datos ajenos por delante.
DELETE FROM sesiones               WHERE usuario_id  IN (SELECT id FROM _users);
DELETE FROM mensajes               WHERE de_usuario_id IN (SELECT id FROM _users);
DELETE FROM chat_mensajes          WHERE cliente_id  IN (SELECT id FROM _users);
DELETE FROM citas                  WHERE cliente_id  IN (SELECT id FROM _users);
DELETE FROM repartidor_movimientos WHERE repartidor_id IN (SELECT id FROM _users);
DELETE FROM ingresos_manuales      WHERE repartidor_id IN (SELECT id FROM _users);

UPDATE pedidos  SET cliente_id      = NULL WHERE cliente_id      IN (SELECT id FROM _users);
UPDATE pedidos  SET repartidor_id   = NULL WHERE repartidor_id   IN (SELECT id FROM _users);
UPDATE usuarios SET referido_por_id = NULL WHERE referido_por_id IN (SELECT id FROM _users);

DELETE FROM usuarios WHERE id IN (SELECT id FROM _users);

-- ── 4. Y por fin los puestos ────────────────────────────────────────
-- Lo que tiene ON DELETE CASCADE (mesas, cuentas, citas del negocio,
-- servicios, horarios, días bloqueados, chat) se va solo.
DELETE FROM puestos WHERE id IN (SELECT id FROM _obj);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- COMPROBACIÓN (después del COMMIT). Debe devolver 0 filas.
-- ═══════════════════════════════════════════════════════════════════
-- SELECT nombre FROM puestos WHERE nombre IN (
--   'Cremeria La Ventanita','Farmacias Similares',
--   'La Hacienda De Chaguas','Rica Pizza','Subway');

-- Productos que quedaron sin precio en NINGUNA tienda. No se borran arriba
-- porque `productos` es compartido entre negocios: si otro los vende, el
-- borrado se lo llevaría de paso.
-- SELECT count(*) FROM productos p
--  WHERE NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id);
