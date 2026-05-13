-- =============================================================================
-- Fix precios variantes Fico: ½L / 1L / Botella tenían precio_override NULL
-- así que los 3 tamaños mostraban el mismo precio (= precio base de la cuba ½L).
-- =============================================================================
-- Diagnóstico:
--   producto_variantes.precio_override = NULL  →  hereda precios.precio (base)
--   Como base = cuba_medio, los 3 tamaños quedaban iguales.
--   Solución: setear precio_override a los valores reales del menú de Fernando.
--
-- También desactivamos la variante ½L en preparados que solo van en 1L
-- (Embrocada, Cazuelas, Clericot) — Fico no los sirve en medio litro.
--
-- Ejecutar con:
--   docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito \
--     < scripts/fix-precios-fico.sql
-- =============================================================================

BEGIN;

-- ─── Helper: UPDATE batch por nombre de producto + variante ──────────────────
-- Cada fila: (producto.nombre, variante.nombre, precio_override)

WITH fix(prod, variante, precio) AS (VALUES
  -- ===== TEQUILA =====
  ('1800 Cristalino',                         'Copa ½L', 150),
  ('1800 Cristalino',                         'Copa 1L', 250),
  ('1800 Cristalino',                         'Botella', 1500),
  ('3 Generaciones',                          'Copa ½L', 160),
  ('3 Generaciones',                          'Copa 1L', 300),
  ('3 Generaciones',                          'Botella', 1900),
  ('7 Leguas Blanco',                         'Copa ½L', 100),
  ('7 Leguas Blanco',                         'Copa 1L', 200),
  ('7 Leguas Blanco',                         'Botella', 1000),
  ('Centenario Añejo',                        'Copa ½L', 100),
  ('Centenario Añejo',                        'Copa 1L', 200),
  ('Centenario Añejo',                        'Botella', 1000),
  ('Centenario Reposado',                     'Copa ½L', 80),
  ('Centenario Reposado',                     'Copa 1L', 130),
  ('Centenario Reposado',                     'Botella', 850),
  ('Don Julio 70',                            'Copa ½L', 200),
  ('Don Julio 70',                            'Copa 1L', 350),
  ('Don Julio 70',                            'Botella', 1900),
  ('D Viejo Añejo',                           'Copa ½L', 100),  -- Nota: el nombre real es "P. Viejo Añejo"
  ('D Viejo Añejo',                           'Copa 1L', 200),
  ('D Viejo Añejo',                           'Botella', 1000),
  ('D Viejo Reposado',                        'Copa ½L', 80),   -- Nota: el nombre real es "P. Viejo Reposado"
  ('D Viejo Reposado',                        'Copa 1L', 130),
  ('D Viejo Reposado',                        'Botella', 850),
  -- "Hacienda de Tepa Tradicional Cristalino" es un producto mergeado en DB
  -- pero en el menú original son DOS marcas separadas (Hacienda de Tepa y
  -- Tradicional Cristalino). Le ponemos los precios de Hacienda de Tepa por
  -- ahora; Fernando puede separar en 2 productos después si quiere.
  ('Hacienda de Tepa Tradicional Cristalino', 'Copa ½L', 80),
  ('Hacienda de Tepa Tradicional Cristalino', 'Copa 1L', 130),
  ('Hacienda de Tepa Tradicional Cristalino', 'Botella', 850),
  ('Herradura Ultra',                         'Copa ½L', 150),
  ('Herradura Ultra',                         'Copa 1L', 250),
  ('Herradura Ultra',                         'Botella', 1600),
  ('H. Sahuayo Blanco Suave',                 'Copa ½L', 100),
  ('H. Sahuayo Blanco Suave',                 'Copa 1L', 200),
  ('H. Sahuayo Blanco Suave',                 'Botella', 1000),
  ('Jimador Cristalino',                      'Copa ½L', 80),
  ('Jimador Cristalino',                      'Copa 1L', 130),
  ('Jimador Cristalino',                      'Botella', 850),
  ('Maestro Dobel Diamante',                  'Copa ½L', 150),
  ('Maestro Dobel Diamante',                  'Copa 1L', 250),
  ('Maestro Dobel Diamante',                  'Botella', 1600),

  -- ===== VODKA =====
  ('Absolut Natural',                         'Copa ½L', 80),
  ('Absolut Natural',                         'Copa 1L', 130),
  ('Absolut Natural',                         'Botella', 750),
  ('Oso Negro',                               'Copa ½L', 50),
  ('Oso Negro',                               'Copa 1L', 100),
  ('Oso Negro',                               'Botella', 650),
  ('Stolichnaya',                             'Copa ½L', 80),
  ('Stolichnaya',                             'Copa 1L', 130),
  ('Stolichnaya',                             'Botella', 750),
  -- Smirnoff Guayaba/Tamarindo ya estaban correctos

  -- ===== WHISKEY =====
  ('Black Label',                             'Copa ½L', 150),
  ('Black Label',                             'Copa 1L', 250),
  ('Black Label',                             'Botella', 1600),
  ('Black & White',                           'Copa ½L', 70),
  ('Black & White',                           'Copa 1L', 120),
  ('Black & White',                           'Botella', 700),
  ('Buchanan''s',                             'Copa ½L', 150),
  ('Buchanan''s',                             'Copa 1L', 250),
  ('Buchanan''s',                             'Botella', 1500),
  ('Red Label',                               'Copa ½L', 80),
  ('Red Label',                               'Copa 1L', 130),
  ('Red Label',                               'Botella', 800),
  -- Passport ya estaba correcto

  -- ===== PREPARADOS (faltantes) =====
  ('69',                                      '½L', 50),
  ('69',                                      '1L', 100),
  ('Baileys',                                 '½L', 80),
  ('Baileys',                                 '1L', 130),
  ('Cielo Rojo',                              '½L', 50),
  ('Cielo Rojo',                              '1L', 100),
  ('Cubalibre',                               '½L', 70),
  ('Cubalibre',                               '1L', 120),
  ('Cuba Libre (Bacardi)',                    '½L', 80),
  ('Cuba Libre (Bacardi)',                    '1L', 130),
  ('El Coqueto (Esp. de la Casa)',            '½L', 50),
  ('El Coqueto (Esp. de la Casa)',            '1L', 100),
  ('El Tóxico (Esp. de la Casa)',             '½L', 50),
  ('El Tóxico (Esp. de la Casa)',             '1L', 100),
  ('Frutos Rojos',                            '½L', 50),
  ('Frutos Rojos',                            '1L', 100),
  ('Kiwi',                                    '½L', 50),
  ('Kiwi',                                    '1L', 100),
  ('Lima',                                    '½L', 50),
  ('Lima',                                    '1L', 100),
  ('Pitufo',                                  '½L', 50),
  ('Pitufo',                                  '1L', 100),

  -- Solo 1L (½L se desactiva más abajo): set 1L al precio del menú
  ('Embrocada',                               '1L', 120),
  ('Cazuelas',                                '1L', 100),
  ('Clericot (1L)',                           '1L', 80),

  -- ===== CERVEZA =====
  ('Michelada Litro',                         '½L', 40),
  ('Michelada Litro',                         '1L', 80)
)
UPDATE producto_variantes pv
SET precio_override = fix.precio
FROM productos p, fix
WHERE pv.producto_id = p.id
  AND p.nombre = fix.prod
  AND pv.nombre = fix.variante
  AND EXISTS (
    SELECT 1 FROM precios pr
    WHERE pr.producto_id = p.id AND pr.puesto_id = 'puesto-fico' AND pr.activo = true
  );

-- ─── Desactivar ½L en preparados que solo se sirven en 1L ────────────────────
UPDATE producto_variantes pv
SET activo = false
FROM productos p
WHERE pv.producto_id = p.id
  AND pv.nombre = '½L'
  AND p.nombre IN ('Embrocada', 'Cazuelas', 'Clericot (1L)')
  AND EXISTS (
    SELECT 1 FROM precios pr
    WHERE pr.producto_id = p.id AND pr.puesto_id = 'puesto-fico' AND pr.activo = true
  );

-- ─── Verificación: cuántas variantes con override quedaron seteadas ──────────
SELECT
  p.seccion,
  COUNT(*) FILTER (WHERE pv.precio_override IS NOT NULL AND pv.activo = true) AS con_override,
  COUNT(*) FILTER (WHERE pv.precio_override IS NULL AND pv.activo = true)     AS sin_override,
  COUNT(*) FILTER (WHERE pv.activo = false)                                   AS desactivadas
FROM productos p
JOIN producto_variantes pv ON pv.producto_id = p.id
JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = 'puesto-fico' AND pr.activo = true
GROUP BY p.seccion
ORDER BY p.seccion;

COMMIT;
