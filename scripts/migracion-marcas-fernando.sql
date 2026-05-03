-- =============================================================================
-- Migración: separar las "marcas" de Mercadito en puestos independientes
-- =============================================================================
-- Antes:
--   puesto 'mercadito' (Fernando, repartidor) tenía productos con
--   seccion = 'Mcdonald's' / 'Little Caesars' / 'Domino´s Pizza' / 'Soriana'
--   y subseccion = tipo de comida (Pizzas, Almuerzos, etc.)
-- Después:
--   4 puestos independientes (mcdonalds, little-caesars, dominos, soriana)
--   con su propia lat/lng, logo y dirección. seccion ya no es marca, ahora
--   es el tipo de comida (lo que era subseccion).
--   mercadito queda en blanco (cero productos) reservado para tienda propia.
-- =============================================================================
-- Pre-requisitos verificados:
--   - 0 pedidos abiertos al momento de planificar la migración
--   - logos copiados a /public/{mcdonalds,little-caesars,dominos,soriana}/logo.<ext>
-- =============================================================================
-- Ejecutar con:
--   docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito \
--     < scripts/migracion-marcas-fernando.sql
-- =============================================================================

BEGIN;

-- 1. Crear los 4 puestos nuevos
INSERT INTO puestos (id, nombre, descripcion, ubicacion, lat, lng, logo, aprobado, activo) VALUES
  ('mcdonalds',      'McDonald''s',     'Hamburguesas, McTrios y Cajitas Feliz',  'Plaza Feria, Blvd. Lázaro Cárdenas Sur 1190, Sahuayo', 20.043628883782365, -102.71708869987673, '/mcdonalds/logo.png',       true, true),
  ('little-caesars', 'Little Caesars',  'Pizzas, paquetes y complementos',        'Plaza Feria, Blvd. Lázaro Cárdenas Sur 1190, Sahuayo', 20.043628883782365, -102.71708869987673, '/little-caesars/logo.jpeg', true, true),
  ('dominos',        'Domino''s Pizza', 'Pizzas, pollo, postres y entradas',      'Blvd. Lázaro Cárdenas Nte. 237, Centro Uno, Sahuayo',  20.054003118109964, -102.71569893173370, '/dominos/logo.jpg',         true, true),
  ('soriana',        'Soriana',         'Abarrotes, limpieza y bebidas',          'Blvd. Lázaro Cárdenas Nte. 745, Sahuayo',              20.074936305614540, -102.71698506470311, '/soriana/logo.jpg',         true, true);

-- 2. Replicar horario de atención de mercadito (08:00–21:30 los 7 días) a los 4
INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra, descanso_desde, descanso_hasta)
SELECT 'mcdonalds',      dia_semana, abre, cierra, descanso_desde, descanso_hasta FROM puesto_horario_atencion WHERE puesto_id = 'mercadito'
UNION ALL
SELECT 'little-caesars', dia_semana, abre, cierra, descanso_desde, descanso_hasta FROM puesto_horario_atencion WHERE puesto_id = 'mercadito'
UNION ALL
SELECT 'dominos',        dia_semana, abre, cierra, descanso_desde, descanso_hasta FROM puesto_horario_atencion WHERE puesto_id = 'mercadito'
UNION ALL
SELECT 'soriana',        dia_semana, abre, cierra, descanso_desde, descanso_hasta FROM puesto_horario_atencion WHERE puesto_id = 'mercadito';

-- 3. Crear los horarios de menú (puesto_horarios) sólo donde hacen falta:
--    McDonald's tiene productos en "Almuerzos" (08–11) y "Comida" (11–22).
--    Domino's tiene productos en "Comida" (11–22).
--    Little Caesars y Soriana no usan horarios de menú.
INSERT INTO puesto_horarios (id, puesto_id, nombre, desde, hasta) VALUES
  ('h-mcdonalds-almuerzos', 'mcdonalds', 'Almuerzos', '08:00', '11:00'),
  ('h-mcdonalds-comida',    'mcdonalds', 'Comida',    '11:00', '22:00'),
  ('h-dominos-comida',      'dominos',   'Comida',    '11:00', '22:00');

-- 4. Reasignar producto_horarios al horario equivalente del puesto correcto.
--    Antes: 21 productos McDonald's "Almuerzos" → h-mercadito-desayuno
--           68 productos McDonald's "Comida"    → h-38acd0fa
--           55 productos Domino's "Comida"      → h-38acd0fa
UPDATE producto_horarios SET horario_id = 'h-mcdonalds-almuerzos'
 WHERE horario_id = 'h-mercadito-desayuno'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Mcdonald''s');

UPDATE producto_horarios SET horario_id = 'h-mcdonalds-comida'
 WHERE horario_id = 'h-38acd0fa'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Mcdonald''s');

UPDATE producto_horarios SET horario_id = 'h-dominos-comida'
 WHERE horario_id = 'h-38acd0fa'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Domino´s Pizza');

-- 5. Poblar puesto_categorias para los 4 puestos nuevos.
--    Basado en la categoria_id real de los productos que vende cada uno.
INSERT INTO puesto_categorias (puesto_id, categoria_id) VALUES
  ('mcdonalds',      'restaurante'),
  ('little-caesars', 'restaurante'),
  ('dominos',        'restaurante'),
  ('soriana',        'limpieza'),
  ('soriana',        'abarrotes');

-- 6. Migrar `precios.puesto_id` de 'mercadito' al puesto correcto según
--    `productos.seccion`. Son los precios activos del catálogo.
UPDATE precios SET puesto_id = 'mcdonalds'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Mcdonald''s');

UPDATE precios SET puesto_id = 'little-caesars'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Little Caesars');

UPDATE precios SET puesto_id = 'dominos'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Domino´s Pizza');

UPDATE precios SET puesto_id = 'soriana'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Soriana');

-- 7. Migrar pedido_items históricos (sólo los 7 que están en mercadito).
--    Para los pedidos pasados queremos que el reporte por puesto muestre la
--    sucursal correcta. Si el producto fue eliminado o no tiene sección,
--    se queda en mercadito (no rompe FKs).
UPDATE pedido_items SET puesto_id = 'mcdonalds'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Mcdonald''s');

UPDATE pedido_items SET puesto_id = 'little-caesars'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Little Caesars');

UPDATE pedido_items SET puesto_id = 'dominos'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Domino´s Pizza');

UPDATE pedido_items SET puesto_id = 'soriana'
 WHERE puesto_id = 'mercadito'
   AND producto_id IN (SELECT id FROM productos WHERE seccion = 'Soriana');

-- 8. Promover `productos.subseccion → seccion` y limpiar la sección vieja
--    (que era la marca). Sólo aplica a los productos que se migraron.
UPDATE productos
   SET seccion = subseccion,
       subseccion = NULL
 WHERE seccion IN ('Mcdonald''s', 'Little Caesars', 'Domino´s Pizza', 'Soriana');

-- 9. Reasignar Fernando como repartidor base de mcdonalds.
UPDATE usuarios SET puesto_id = 'mcdonalds' WHERE id = 'fernando-1';

-- 10. Crear los 4 usuarios `tienda` para que Fernando pueda hacer login y
--     editar productos de cada sucursal. PIN en texto plano: auth.ts lo
--     migra a bcrypt al primer login (ver src/lib/auth.ts:49).
INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo) VALUES
  ('tienda-mcdonalds',      'McDonald''s Sahuayo', '3531539603', '2006', 'tienda', 'mcdonalds',      true),
  ('tienda-little-caesars', 'Little Caesars',      '3531539604', '2006', 'tienda', 'little-caesars', true),
  ('tienda-dominos',        'Domino''s Pizza',     '3531539605', '2006', 'tienda', 'dominos',        true),
  ('tienda-soriana',        'Soriana',             '3531539606', '2006', 'tienda', 'soriana',        true);

-- 11. Limpiar las categorías viejas de mercadito (que tenía 'verduras' y
--     'bebidas' sin productos asociados). Los horarios y horario_atencion
--     de mercadito se mantienen como base por si lo reusas.
DELETE FROM puesto_categorias WHERE puesto_id = 'mercadito';

-- =============================================================================
-- Verificaciones de sanity dentro de la transacción.
-- Si algo no cuadra, hacé ROLLBACK en lugar de COMMIT.
-- =============================================================================
SELECT 'Puestos nuevos:' AS check, id, nombre, lat, lng FROM puestos WHERE id IN ('mcdonalds','little-caesars','dominos','soriana') ORDER BY id;

SELECT 'Productos por puesto:' AS check, pr.puesto_id, COUNT(DISTINCT pr.producto_id) AS productos
  FROM precios pr WHERE pr.puesto_id IN ('mcdonalds','little-caesars','dominos','soriana','mercadito') AND pr.activo = true
  GROUP BY pr.puesto_id ORDER BY pr.puesto_id;

SELECT 'Secciones promovidas:' AS check, p.seccion, COUNT(*) AS productos
  FROM productos p JOIN precios pr ON pr.producto_id = p.id
  WHERE pr.puesto_id IN ('mcdonalds','little-caesars','dominos','soriana')
  GROUP BY p.seccion ORDER BY p.seccion NULLS FIRST;

SELECT 'Usuarios tienda creados:' AS check, id, telefono, puesto_id FROM usuarios WHERE id LIKE 'tienda-%' ORDER BY id;

SELECT 'Fernando reasignado:' AS check, id, telefono, rol, puesto_id FROM usuarios WHERE id = 'fernando-1';

-- =============================================================================
-- Si todo se ve bien:
COMMIT;
-- Si algo está raro:
-- ROLLBACK;
-- =============================================================================
