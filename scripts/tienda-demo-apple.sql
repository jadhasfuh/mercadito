-- Tienda de DEMOSTRACIÓN para la revisión de Apple / Google.
--
-- Credenciales que se declaran en App Store Connect:
--   Teléfono: 5555555555      PIN: 123456
--
-- Nota sobre el PIN: 123456 está en la lista de PINs prohibidos
-- (lib/validators, PIN_COMUNES), así que NO se puede crear desde la app. Aquí
-- se inserta el hash directo, y el login solo valida que sean 6 dígitos — por
-- eso funciona. Es aceptable en una cuenta cuyo objetivo es ser compartida
-- con un revisor, pero BÓRRALA cuando aprueben (al final del archivo).
--
-- Idempotente: se puede volver a correr sin duplicar nada.
-- Uso: Supabase → SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── El negocio ──────────────────────────────────────────────────────
-- Público a propósito: el revisor tiene que poder abrir el menú desde el
-- botón "Ver mi menú" del panel, y con menu_publico = false daría 404.
INSERT INTO puestos (
  id, nombre, descripcion, ubicacion, activo, aprobado, telefono_contacto,
  ciudad, lat, lng, menu_slug, menu_publico, dine_in_activo,
  metodos_pago_mesa, tipo, plan, suscripcion_hasta
) VALUES (
  'demo-apple', 'Cocina Demo', 'Negocio de demostración de Mercadito',
  'Centro, Sahuayo', true, true, '3531278217',
  'sahuayo', 20.0563, -102.7216, 'demo', true, true,
  '["caja","transferencia"]'::jsonb, 'ambos', 'pro', NOW() + INTERVAL '2 years'
)
ON CONFLICT (id) DO UPDATE SET
  activo = true, aprobado = true, menu_publico = true, dine_in_activo = true,
  suscripcion_hasta = NOW() + INTERVAL '2 years',
  telefono_contacto = EXCLUDED.telefono_contacto;

-- ── El usuario dueño ────────────────────────────────────────────────
-- gen_salt('bf', 10) genera un hash $2a$ con el mismo coste que usa la app,
-- y bcryptjs lo verifica sin problema.
INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo)
VALUES ('demo-apple-user', 'Cocina Demo', '5555555555',
        crypt('123456', gen_salt('bf', 10)), 'tienda', 'demo-apple', true)
ON CONFLICT (id) DO UPDATE SET
  telefono = EXCLUDED.telefono, pin = EXCLUDED.pin,
  puesto_id = 'demo-apple', rol = 'tienda', activo = true;

-- ── El menú ─────────────────────────────────────────────────────────
INSERT INTO categorias (id, nombre, icono, orden)
VALUES ('restaurante', 'Restaurante / Comida', '🍽️', 7) ON CONFLICT DO NOTHING;

INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion, subseccion, disponible) VALUES
  ('demo-p1','Chilaquiles verdes','restaurante','orden','Con pollo deshebrado, crema y queso','Desayunos','Comida', true),
  ('demo-p2','Huevos al gusto','restaurante','orden','Revueltos, estrellados o a la mexicana','Desayunos','Comida', true),
  ('demo-p3','Hamburguesa de la casa','restaurante','pieza','Carne de res, tocino y queso amarillo','Hamburguesas','Comida', true),
  ('demo-p4','Alitas','restaurante','orden','8 piezas con la salsa que elijas','Hamburguesas','Comida', true),
  ('demo-p5','Ensalada César','restaurante','orden','Lechuga, crutones, parmesano y aderezo','Ensaladas','Comida', true),
  ('demo-p6','Agua de horchata','restaurante','vaso','Vaso de medio litro','Bebidas','Bebidas', true),
  ('demo-p7','Limonada natural','restaurante','vaso','Preparada al momento','Bebidas','Bebidas', true),
  ('demo-p8','Café americano','restaurante','vaso','Grano de Michoacán','Bebidas','Bebidas', true),
  ('demo-p9','Flan napolitano','restaurante','pieza','Casero, receta de la abuela','Postres','Postres', true),
  ('demo-p10','Empanadas','restaurante','pieza','De cajeta o de manzana','Postres','Postres', true)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;

INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo, precio_mayoreo, mayoreo_desde) VALUES
  ('demo-pr1','demo-p1','demo-apple', 95, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr2','demo-p2','demo-apple', 85, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr3','demo-p3','demo-apple',140, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr4','demo-p4','demo-apple',165, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr5','demo-p5','demo-apple',110, CURRENT_DATE, true, NULL, NULL),
  -- Con mayoreo, para que se vea la etiqueta "3 o más a $30 c/u" en el menú.
  ('demo-pr6','demo-p6','demo-apple', 35, CURRENT_DATE, true, 30, 3),
  ('demo-pr7','demo-p7','demo-apple', 35, CURRENT_DATE, true, 30, 3),
  ('demo-pr8','demo-p8','demo-apple', 40, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr9','demo-p9','demo-apple', 55, CURRENT_DATE, true, NULL, NULL),
  ('demo-pr10','demo-p10','demo-apple', 30, CURRENT_DATE, true, 25, 6)
ON CONFLICT (id) DO UPDATE SET
  precio = EXCLUDED.precio, activo = true,
  precio_mayoreo = EXCLUDED.precio_mayoreo, mayoreo_desde = EXCLUDED.mayoreo_desde;

-- ── Variantes (sabores) en las alitas, para que el revisor vea el flujo ──
INSERT INTO producto_opciones (id, producto_id, nombre, orden)
VALUES ('demo-op1','demo-p4','Salsa', 0) ON CONFLICT (id) DO NOTHING;

-- La columna es `valor` (no `nombre`) y no lleva precio_extra: el precio de
-- cada presentación vive en producto_variantes.precio_override.
INSERT INTO producto_opcion_valores (id, opcion_id, valor, orden) VALUES
  ('demo-v1','demo-op1','BBQ', 0),
  ('demo-v2','demo-op1','Búfalo', 1),
  ('demo-v3','demo-op1','Mango habanero', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO producto_variantes (id, producto_id, nombre, precio_override, activo, orden) VALUES
  ('demo-var1','demo-p4','BBQ', 165, true, 0),
  ('demo-var2','demo-p4','Búfalo', 165, true, 1),
  ('demo-var3','demo-p4','Mango habanero', 175, true, 2)
ON CONFLICT (id) DO UPDATE SET precio_override = EXCLUDED.precio_override, activo = true;

INSERT INTO variante_valores (variante_id, valor_id) VALUES
  ('demo-var1','demo-v1'), ('demo-var2','demo-v2'), ('demo-var3','demo-v3')
ON CONFLICT DO NOTHING;

-- ── Mesas, para la demo de comandas ─────────────────────────────────
INSERT INTO mesas (id, puesto_id, etiqueta, token, activa, orden) VALUES
  ('demo-m1','demo-apple','Mesa 1','demo-mesa-uno',  true, 1),
  ('demo-m2','demo-apple','Mesa 2','demo-mesa-dos',  true, 2),
  ('demo-m3','demo-apple','Barra', 'demo-mesa-barra',true, 3)
ON CONFLICT (id) DO UPDATE SET activa = true, token = EXCLUDED.token;

-- ── Servicios, para la demo de reservas ─────────────────────────────
INSERT INTO servicios (id, puesto_id, nombre, duracion_min, precio, activo) VALUES
  ('demo-s1','demo-apple','Reservación de mesa', 60, 0, true),
  ('demo-s2','demo-apple','Evento privado', 120, 500, true)
ON CONFLICT (id) DO UPDATE SET activo = true;

-- Horario de atención (lunes a domingo, 8:00–22:00) para que el menú salga
-- como "Abierto" y los slots de reserva tengan dónde caer.
INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra)
SELECT 'demo-apple', d, '08:00', '22:00' FROM generate_series(0, 6) d
ON CONFLICT (puesto_id, dia_semana) DO UPDATE SET abre = '08:00', cierra = '22:00';


-- ═══════════════════════════════════════════════════════════════════
-- COMPROBAR
-- ═══════════════════════════════════════════════════════════════════
SELECT p.nombre, p.menu_slug, u.telefono,
       (SELECT count(*) FROM precios WHERE puesto_id = 'demo-apple' AND activo) AS productos,
       (SELECT count(*) FROM mesas   WHERE puesto_id = 'demo-apple' AND activa) AS mesas
FROM puestos p JOIN usuarios u ON u.puesto_id = p.id
WHERE p.id = 'demo-apple';

-- El menú queda en:  https://mercadito.cx/m/demo
-- Una mesa en:       https://mercadito.cx/m/demo/mesa/demo-mesa-uno


-- ═══════════════════════════════════════════════════════════════════
-- BORRAR cuando aprueben (el PIN es débil a propósito, no la dejes viva)
-- ═══════════════════════════════════════════════════════════════════
-- DELETE FROM variante_valores WHERE variante_id LIKE 'demo-var%';
-- DELETE FROM producto_variantes WHERE producto_id LIKE 'demo-p%';
-- DELETE FROM producto_opcion_valores WHERE opcion_id = 'demo-op1';
-- DELETE FROM producto_opciones WHERE producto_id LIKE 'demo-p%';
-- DELETE FROM servicios WHERE puesto_id = 'demo-apple';
-- DELETE FROM pedido_items WHERE puesto_id = 'demo-apple';
-- DELETE FROM pedidos WHERE cuenta_id IN (SELECT id FROM cuentas WHERE puesto_id = 'demo-apple');
-- DELETE FROM cuentas WHERE puesto_id = 'demo-apple';
-- DELETE FROM mesas WHERE puesto_id = 'demo-apple';
-- DELETE FROM precios WHERE puesto_id = 'demo-apple';
-- DELETE FROM productos WHERE id LIKE 'demo-p%';
-- DELETE FROM puesto_horario_atencion WHERE puesto_id = 'demo-apple';
-- DELETE FROM sesiones WHERE usuario_id = 'demo-apple-user';
-- DELETE FROM usuarios WHERE id = 'demo-apple-user';
-- DELETE FROM puestos WHERE id = 'demo-apple';
