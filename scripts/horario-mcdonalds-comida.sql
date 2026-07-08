-- Aplicado a producción (Supabase) el 2026-07-08.
-- Asigna TODOS los productos de McDonald's a la ventana "Comida" (11:00-22:00),
-- para que el menú aparezca solo de 11am a 10pm (oculto 8-11). Idempotente.
--
-- Correr:  psql "$DATABASE_URL" -f scripts/horario-mcdonalds-comida.sql
INSERT INTO producto_horarios (producto_id, horario_id)
SELECT DISTINCT p.id, 'h-mcdonalds-comida'
FROM productos p
JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = 'mcdonalds' AND pr.activo = true
ON CONFLICT (producto_id, horario_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- DESHACER (volver a "siempre visible"): borra la asignación de la ventana Comida
--   DELETE FROM producto_horarios
--   WHERE horario_id = 'h-mcdonalds-comida'
--     AND producto_id IN (
--       SELECT pr.producto_id FROM precios pr
--       WHERE pr.puesto_id = 'mcdonalds' AND pr.activo = true
--     );
