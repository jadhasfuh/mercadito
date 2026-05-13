-- =============================================================================
-- Fix nombres Fico: typos + split de producto mergeado
-- =============================================================================
-- 1. "D Viejo Añejo" → "P. Viejo Añejo"           (typo: P transcribió como D)
-- 2. "D Viejo Reposado" → "P. Viejo Reposado"
-- 3. "Cristal (shot)" → "Cristiada Shot"
-- 4. "Hacienda de Tepa Tradicional Cristalino" → "Hacienda de Tepa"
--    + crear nuevo producto "Tradicional Cristalino" con sus propios precios
--      (½L $100 / 1L $200 / Botella $1000).
--
-- Ejecutar con:
--   docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito \
--     < scripts/fix-nombres-fico.sql
-- =============================================================================

BEGIN;

-- ─── 1-3. Renombrados simples ────────────────────────────────────────────────
UPDATE productos SET nombre = 'P. Viejo Añejo'    WHERE nombre = 'D Viejo Añejo';
UPDATE productos SET nombre = 'P. Viejo Reposado' WHERE nombre = 'D Viejo Reposado';
UPDATE productos SET nombre = 'Cristiada Shot'    WHERE nombre = 'Cristal (shot)';

-- ─── 4a. Renombrar el producto mergeado para que sea "Hacienda de Tepa" solo ─
-- Sus precios actuales (½L $80 / 1L $130 / Botella $850) ya corresponden a HdT.
UPDATE productos SET nombre = 'Hacienda de Tepa'
WHERE nombre = 'Hacienda de Tepa Tradicional Cristalino';

-- ─── 4b. Crear "Tradicional Cristalino" como producto nuevo ──────────────────
INSERT INTO productos (id, nombre, categoria_id, unidad, seccion)
VALUES ('fico-trad-cristalino', 'Tradicional Cristalino', 'botanero', 'pieza', 'Tequila')
ON CONFLICT (id) DO NOTHING;

INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo)
VALUES ('fico-pr-trad-cristalino', 'fico-trad-cristalino', 'puesto-fico', 100, CURRENT_DATE, true)
ON CONFLICT (id) DO NOTHING;

-- Opción "Tamaño" + valores
INSERT INTO producto_opciones (id, producto_id, nombre, orden)
VALUES ('fico-opc-trad-cristalino', 'fico-trad-cristalino', 'Tamaño', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO producto_opcion_valores (id, opcion_id, valor, orden, precio_extra) VALUES
  ('fico-val-trad-cristalino-medio',   'fico-opc-trad-cristalino', 'Copa ½L', 0, 0),
  ('fico-val-trad-cristalino-litro',   'fico-opc-trad-cristalino', 'Copa 1L', 1, 0),
  ('fico-val-trad-cristalino-botella', 'fico-opc-trad-cristalino', 'Botella', 2, 0)
ON CONFLICT (id) DO NOTHING;

-- Variantes con precio_override (siguen el mismo patrón que el resto del menú)
INSERT INTO producto_variantes (id, producto_id, nombre, precio_override, activo, orden) VALUES
  ('fico-var-trad-cristalino-medio',   'fico-trad-cristalino', 'Copa ½L',  100, true, 0),
  ('fico-var-trad-cristalino-litro',   'fico-trad-cristalino', 'Copa 1L',  200, true, 1),
  ('fico-var-trad-cristalino-botella', 'fico-trad-cristalino', 'Botella', 1000, true, 2)
ON CONFLICT (id) DO NOTHING;

-- Linkear variantes ↔ valores de opción
INSERT INTO variante_valores (variante_id, valor_id) VALUES
  ('fico-var-trad-cristalino-medio',   'fico-val-trad-cristalino-medio'),
  ('fico-var-trad-cristalino-litro',   'fico-val-trad-cristalino-litro'),
  ('fico-var-trad-cristalino-botella', 'fico-val-trad-cristalino-botella')
ON CONFLICT DO NOTHING;

-- ─── Verificación ────────────────────────────────────────────────────────────
SELECT p.nombre, p.seccion, pv.nombre AS variante, pv.precio_override
FROM productos p
LEFT JOIN producto_variantes pv ON pv.producto_id = p.id AND pv.activo = true
JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = 'puesto-fico' AND pr.activo = true
WHERE p.nombre IN ('P. Viejo Añejo', 'P. Viejo Reposado', 'Cristiada Shot', 'Hacienda de Tepa', 'Tradicional Cristalino')
ORDER BY p.nombre, pv.orden;

COMMIT;
