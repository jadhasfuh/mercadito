-- =============================================================================
-- Carga inicial: CarneMart (Campaña "Campeones del Ahorro", vigente 11–17 mayo)
-- =============================================================================
-- Crea:
--   - Puesto `carnemart` en Sahuayo con coords 20.04965, -102.71666
--   - Horario de atención 08:00–19:00 los 7 días
--   - Usuario rol='tienda' tel 3535339858 PIN 120306 (lo opera Fernando)
--   - 90 productos con sección preservada según el flyer (Taquiza, Mayoreo, etc.)
--
-- Categorías destino (de la taxonomía Mercadito existente):
--   carnes      → toda la proteína (res, cerdo, pollo, mariscos, embutidos)
--   cremeria    → quesos (Chihuahua, Mozzarella, Gouda, Manchego, Crema, etc.)
--   abarrotes   → aceites, salsas, mayo, catsup, papa/dedos congelados
--   bebidas     → Pepsi, Be Light, Agua (packs promo)
--   panaderia   → Medias Noches, Bimbollos, Pan Blanco
--
-- Duplicados consolidados (catálogo los listaba en 2 secciones):
--   - Costilla Corbata de Cerdo (Grill 86.90 vs Empanizados 85.90) → Grill 86.90
--   - Costilla Back Rib de Cerdo (Grill 137.90 vs Mayoreo 136.90)  → Grill 137.90
--   - Milanesa de Cerdo (Mayoreo 86.90 vs Empanizados 88.90)       → Mayoreo 86.90
--   - Aderezo Ranch FS 3.78 lt (264.90) vs 3.78 L (262.90)         → Grill 264.90
--
-- Packs promo (unit=paquete con descripción del pack):
--   - Pepsi 600 ml 2x $34.50 = pack 2 piezas
--   - Pepsi 2 L 3x $97.90    = pack 3 piezas
--   - Be Light 3x $46.90     = pack 3 piezas
--   - Agua Nature Best 35 pack $97.50 = pack 35 piezas
--
-- Ejecutar con:
--   docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito \
--     < scripts/cargar-carnemart.sql
-- =============================================================================

BEGIN;

-- ─── Tienda ──────────────────────────────────────────────────────────────────
INSERT INTO puestos (id, nombre, descripcion, ubicacion, telefono_contacto, lat, lng, aprobado, activo)
VALUES (
  'carnemart',
  'CarneMart',
  'Carnicería, embutidos, quesos, abarrotes y bebidas. Campaña Campeones del Ahorro vigente 11–17 mayo.',
  'Sahuayo, Michoacán',
  '3535339858',
  20.049651806526423,
  -102.71666105830052,
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── Horario de atención: 08:00–19:00 los 7 días ─────────────────────────────
INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra)
SELECT 'carnemart', d, '08:00', '19:00'
FROM generate_series(0, 6) d
ON CONFLICT (puesto_id, dia_semana) DO NOTHING;

-- ─── Usuario tienda (Fernando opera con PIN 120306) ──────────────────────────
INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo)
VALUES ('carnemart-tienda-1', 'CarneMart', '3535339858', '120306', 'tienda', 'carnemart', true)
ON CONFLICT DO NOTHING;

-- ─── Productos ───────────────────────────────────────────────────────────────
INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, seccion) VALUES
  -- Taquiza
  ('cm-taq-carne-asar',     'Carne para Asar',                'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-rib-eye',        'Rib Eye',                        'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-cerdo-pastor',   'Carne de Cerdo al Pastor',       'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-diezmillo',      'Diezmillo sin hueso',            'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-top-sirloin',    'Top Sirloin',                    'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-picada-cerdo',   'Picada de Cerdo',                'carnes',    'kg',    NULL,                'Taquiza'),
  ('cm-taq-aceite-justo',   'Aceite Justo 800 ml',            'abarrotes', 'pieza', NULL,                'Taquiza'),

  -- Snacks y Complementos
  ('cm-snk-medias-noches',  'Medias Noches Bimbo',            'panaderia', 'pieza', NULL,                'Snacks y Complementos'),
  ('cm-snk-salchicha-graf', 'Salchicha de Res Graf for Chef', 'carnes',    'pieza', NULL,                'Snacks y Complementos'),
  ('cm-snk-recortes-tocino','Recortes de Tocino',             'carnes',    'kg',    NULL,                'Snacks y Complementos'),
  ('cm-snk-boneless-fresk', 'Boneless Naturales Freskecito',  'carnes',    'kg',    NULL,                'Snacks y Complementos'),
  ('cm-snk-bimbollos',      'Bimbollos Bimbo',                'panaderia', 'pieza', NULL,                'Snacks y Complementos'),
  ('cm-snk-hamb-sirloin',   'Hamburguesa Sirloin CH 10 pz',   'carnes',    'pieza', 'Paquete 10 piezas', 'Snacks y Complementos'),
  ('cm-snk-catsup-star',    'Salsa Catsup Star Value 950 g',  'abarrotes', 'pieza', NULL,                'Snacks y Complementos'),
  ('cm-snk-mayonesa-star',  'Mayonesa Star Value 950 g',      'abarrotes', 'pieza', NULL,                'Snacks y Complementos'),

  -- Grill del Norte
  ('cm-grl-papa-lisa-fs',     'Papa Lisa Food Service 2.27 kg',                 'abarrotes', 'pieza', NULL, 'Grill del Norte'),
  ('cm-grl-papa-lisa-granel', 'Papa Lisa a Granel',                             'abarrotes', 'kg',    NULL, 'Grill del Norte'),
  ('cm-grl-dedos-queso',      'Dedos de Queso Mozzarella Brew City 907 g',      'abarrotes', 'pieza', NULL, 'Grill del Norte'),
  ('cm-grl-costilla-corbata', 'Costilla Corbata de Cerdo',                      'carnes',    'kg',    NULL, 'Grill del Norte'),
  ('cm-grl-costilla-back',    'Costilla Back Rib de Cerdo',                     'carnes',    'kg',    NULL, 'Grill del Norte'),
  ('cm-grl-bbq-zaaschila',    'Salsa BBQ Sweet & Spicy Zaaschila',              'abarrotes', 'pieza', NULL, 'Grill del Norte'),
  ('cm-grl-ranch-fs',         'Aderezo Ranch Food Service 3.78 L',              'abarrotes', 'pieza', NULL, 'Grill del Norte'),

  -- Mayoreo y Restaurantero
  ('cm-may-mil-pechuga-prm', 'Milanesa de Pechuga Premium',         'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-mil-res-pulpa',   'Milanesa de Res Pulpa Bola',          'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-mil-cerdo',       'Milanesa de Cerdo',                   'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-mozz-rallado',    'Queso Mozzarella Rallado Cono Sur',   'cremeria', 'pieza', NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-crema-delphy',    'Queso Crema Delphy 1.36 kg',          'cremeria', 'pieza', NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-picada-res',      'Picada de Res',                       'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-carne-asar-may',  'Carne para Asar Mayoreo',             'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-fajitas-arr',     'Fajitas de Res Sabor Arrachera',      'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-rib-eye-sh',      'Rib Eye sin Hueso',                   'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-pechuga-prm-sh',  'Pechuga Premium s/h de Pollo',        'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-hamb-pollo',      'Hamburguesa de Pollo Freskecito',     'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-picada-cerdo-may','Picada de Cerdo Mayoreo',             'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-chiles-jal',      'Chiles Jalapeños Nachos 1.5 kg',      'abarrotes','pieza', NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-camaron-crudo',   'Camarón Crudo',                       'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-menudo-cubic',    'Menudo Cubicado',                     'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-menudo-trozo',    'Menudo de Res en Trozo',              'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-chuleta-ahum',    'Chuleta Ahumada Rebanada de Cerdo',   'carnes',   'kg',    NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-jamon-dixie',     'Bipack Jamón Sandwichero Dixie',      'carnes',   'pieza', NULL, 'Mayoreo y Restaurantero'),
  ('cm-may-salch-viena',     'Salchicha Viena Dixie Farm',          'carnes',   'pieza', NULL, 'Mayoreo y Restaurantero'),

  -- Domingazo de Regalo
  ('cm-dom-salch-asar-16',   'Salchicha para Asar Dixie Farm 1.6 kg',       'carnes',   'pieza', NULL, 'Domingazo de Regalo'),
  ('cm-dom-chistorra',       'Chistorra Campestre 327 g',                   'carnes',   'pieza', NULL, 'Domingazo de Regalo'),
  ('cm-dom-chorizo-arg',     'Chorizo Argentino Campestre 1 kg',            'carnes',   'kg',    NULL, 'Domingazo de Regalo'),
  ('cm-dom-salch-asar-800',  'Salchicha para Asar Dixie Farm 800 g 8 pz',   'carnes',   'pieza', NULL, 'Domingazo de Regalo'),
  ('cm-dom-queso-amer',      'Queso Americano Cono Sur',                    'cremeria', 'pieza', NULL, 'Domingazo de Regalo'),

  -- Boneless y Alitas
  ('cm-bon-nugget-select',   'Nugget Select',         'carnes', 'kg', NULL, 'Boneless y Alitas'),
  ('cm-bon-tender-premium',  'Tender Premium',        'carnes', 'kg', NULL, 'Boneless y Alitas'),
  ('cm-bon-fuego',           'Boneless Fuego',        'carnes', 'kg', NULL, 'Boneless y Alitas'),
  ('cm-bon-alita-enchilada', 'Alita Enchilada',       'carnes', 'kg', NULL, 'Boneless y Alitas'),
  ('cm-bon-alita-natural',   'Alita Natural',         'carnes', 'kg', NULL, 'Boneless y Alitas'),
  ('cm-bon-alita-botanera',  'Alita Botanera',        'carnes', 'kg', NULL, 'Boneless y Alitas'),

  -- Carnes y Empanizados (sin los duplicados ya cargados en Grill / Mayoreo)
  ('cm-emp-arrachera-cerdo', 'Arrachera Marinada de Cerdo',                 'carnes', 'kg',    NULL, 'Carnes y Empanizados'),
  ('cm-emp-chuleta-lomo',    'Chuleta de Lomo de Cerdo',                    'carnes', 'kg',    NULL, 'Carnes y Empanizados'),
  ('cm-emp-adobada-rosa',    'Carne Adobada de Cerdo Rosa',                 'carnes', 'kg',    NULL, 'Carnes y Empanizados'),
  ('cm-emp-cana-lomo',       'Caña de Lomo de Cerdo',                       'carnes', 'kg',    NULL, 'Carnes y Empanizados'),
  ('cm-emp-costilla-parr',   'Costilla Parrillera de Cerdo',                'carnes', 'kg',    NULL, 'Carnes y Empanizados'),
  ('cm-emp-hamb-western-12', 'Hamburguesa Western Grillers Bolsa 12 pz',    'carnes', 'pieza', NULL, 'Carnes y Empanizados'),
  ('cm-emp-hamb-sonora-8',   'Hamburguesa Sonora Ranchera Bolsa 8 pz',      'carnes', 'pieza', NULL, 'Carnes y Empanizados'),
  ('cm-emp-tilapia',         'Filete Tilapia Empanizado',                   'carnes', 'kg',    NULL, 'Carnes y Empanizados'),

  -- Bebidas y Abarrotes
  ('cm-beb-pepsi-600',      'Pepsi 600 ml',                                       'bebidas',   'paquete', 'Pack 2 piezas',  'Bebidas y Abarrotes'),
  ('cm-beb-pepsi-2l',       'Pepsi 2 L',                                          'bebidas',   'paquete', 'Pack 3 piezas',  'Bebidas y Abarrotes'),
  ('cm-beb-be-light',       'Be Light',                                           'bebidas',   'paquete', 'Pack 3 piezas',  'Bebidas y Abarrotes'),
  ('cm-beb-agua-nb',        'Agua Nature Best 500 ml',                            'bebidas',   'paquete', 'Pack 35 piezas', 'Bebidas y Abarrotes'),
  ('cm-beb-pan-nb',         'Pan Blanco Rebanado Natures Best 640 g',             'panaderia', 'pieza',   NULL,             'Bebidas y Abarrotes'),
  ('cm-beb-salsa-pizza',    'Salsa para Pizza Food Service 3 kg',                 'abarrotes', 'pieza',   NULL,             'Bebidas y Abarrotes'),
  ('cm-beb-salsas-zaasc',   'Variedad de Salsas Botaneras Zaaschila 425 g',       'abarrotes', 'pieza',   NULL,             'Bebidas y Abarrotes'),
  ('cm-beb-mi-catsup',      'Mi Catsup 1 kg',                                     'abarrotes', 'pieza',   NULL,             'Bebidas y Abarrotes'),
  ('cm-beb-champinon',      'Champiñón Rebanado Champimex Lata 2.8 kg',           'abarrotes', 'pieza',   NULL,             'Bebidas y Abarrotes'),

  -- Ofertones
  ('cm-of-mil-pollo',       'Milanesa de Pechuga de Pollo',          'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-pechuga-iqf',     'Pechuga Premium sin hueso IQF',         'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-pierna-muslo',    'Pierna y Muslo de Pollo IQF',           'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-jamon-fs',        'Jamón Food Service',                    'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-bistec-res',      'Bistec de Res',                         'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-carne-picada',    'Carne Picada de Res',                   'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-camaron-med',     'Camarón Crudo Mediano sin Cabeza',      'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-pierna-sh',       'Pierna sin Hueso Frontera',             'carnes',   'kg',    NULL, 'Ofertones'),
  ('cm-of-gouda-bipack',    'Queso Gouda Rebanado Cono Sur Bi Pack', 'cremeria', 'pieza', NULL, 'Ofertones'),

  -- Quesos
  ('cm-qso-chihuahua',      'Queso Chihuahua Rallado Food Service',  'cremeria', 'bolsa', NULL, 'Quesos'),
  ('cm-qso-crema-190',      'Queso Crema Cono Sur 190 g',            'cremeria', 'pieza', NULL, 'Quesos'),
  ('cm-qso-mozzarella',     'Queso Mozzarella Cono Sur',             'cremeria', 'kg',    NULL, 'Quesos'),
  ('cm-qso-tres-quesos',    'Tres Quesos Rallado Cono Sur 2.27 kg',  'cremeria', 'pieza', NULL, 'Quesos'),
  ('cm-qso-gouda',          'Queso Gouda Cono Sur',                  'cremeria', 'kg',    NULL, 'Quesos'),
  ('cm-qso-manchego',       'Queso Manchego Cono Sur',               'cremeria', 'kg',    NULL, 'Quesos'),

  -- Molidas
  ('cm-mol-sirloin',        'Molida de Sirloin',                     'carnes', 'kg', NULL, 'Molidas'),
  ('cm-mol-especial',       'Molida Especial',                       'carnes', 'kg', NULL, 'Molidas'),
  ('cm-mol-comercial',      'Molida Comercial',                      'carnes', 'kg', NULL, 'Molidas'),
  ('cm-mol-pulpas',         'Molida de Pulpas',                      'carnes', 'kg', NULL, 'Molidas'),
  ('cm-mol-cerdo',          'Molida de Cerdo',                       'carnes', 'kg', NULL, 'Molidas'),
  ('cm-mol-pollo',          'Molida de Pollo',                       'carnes', 'kg', NULL, 'Molidas')
ON CONFLICT (id) DO NOTHING;

-- ─── Precios (vinculados al puesto carnemart) ────────────────────────────────
INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES
  -- Taquiza
  ('cm-pr-taq-carne-asar',   'cm-taq-carne-asar',     'carnemart', 162.90, CURRENT_DATE, true),
  ('cm-pr-taq-rib-eye',      'cm-taq-rib-eye',        'carnemart', 229.90, CURRENT_DATE, true),
  ('cm-pr-taq-cerdo-pastor', 'cm-taq-cerdo-pastor',   'carnemart',  99.90, CURRENT_DATE, true),
  ('cm-pr-taq-diezmillo',    'cm-taq-diezmillo',      'carnemart', 165.90, CURRENT_DATE, true),
  ('cm-pr-taq-top-sirloin',  'cm-taq-top-sirloin',    'carnemart', 194.90, CURRENT_DATE, true),
  ('cm-pr-taq-picada-cerdo', 'cm-taq-picada-cerdo',   'carnemart',  87.90, CURRENT_DATE, true),
  ('cm-pr-taq-aceite-justo', 'cm-taq-aceite-justo',   'carnemart',  28.90, CURRENT_DATE, true),

  -- Snacks y Complementos
  ('cm-pr-snk-medias-noches', 'cm-snk-medias-noches', 'carnemart',  63.90, CURRENT_DATE, true),
  ('cm-pr-snk-salchicha-graf','cm-snk-salchicha-graf','carnemart', 188.90, CURRENT_DATE, true),
  ('cm-pr-snk-recortes-tocino','cm-snk-recortes-tocino','carnemart', 99.90, CURRENT_DATE, true),
  ('cm-pr-snk-boneless-fresk','cm-snk-boneless-fresk','carnemart', 149.90, CURRENT_DATE, true),
  ('cm-pr-snk-bimbollos',    'cm-snk-bimbollos',     'carnemart',  79.90, CURRENT_DATE, true),
  ('cm-pr-snk-hamb-sirloin', 'cm-snk-hamb-sirloin',  'carnemart', 124.90, CURRENT_DATE, true),
  ('cm-pr-snk-catsup-star',  'cm-snk-catsup-star',   'carnemart',  30.90, CURRENT_DATE, true),
  ('cm-pr-snk-mayonesa-star','cm-snk-mayonesa-star', 'carnemart',  57.90, CURRENT_DATE, true),

  -- Grill del Norte
  ('cm-pr-grl-papa-lisa-fs',    'cm-grl-papa-lisa-fs',     'carnemart', 107.90, CURRENT_DATE, true),
  ('cm-pr-grl-papa-lisa-granel','cm-grl-papa-lisa-granel', 'carnemart', 107.90, CURRENT_DATE, true),
  ('cm-pr-grl-dedos-queso',     'cm-grl-dedos-queso',      'carnemart', 174.90, CURRENT_DATE, true),
  ('cm-pr-grl-costilla-corbata','cm-grl-costilla-corbata', 'carnemart',  86.90, CURRENT_DATE, true),
  ('cm-pr-grl-costilla-back',   'cm-grl-costilla-back',    'carnemart', 137.90, CURRENT_DATE, true),
  ('cm-pr-grl-bbq-zaaschila',   'cm-grl-bbq-zaaschila',    'carnemart',  42.90, CURRENT_DATE, true),
  ('cm-pr-grl-ranch-fs',        'cm-grl-ranch-fs',         'carnemart', 264.90, CURRENT_DATE, true),

  -- Mayoreo y Restaurantero
  ('cm-pr-may-mil-pechuga-prm','cm-may-mil-pechuga-prm','carnemart',  97.90, CURRENT_DATE, true),
  ('cm-pr-may-mil-res-pulpa', 'cm-may-mil-res-pulpa', 'carnemart', 174.90, CURRENT_DATE, true),
  ('cm-pr-may-mil-cerdo',     'cm-may-mil-cerdo',     'carnemart',  86.90, CURRENT_DATE, true),
  ('cm-pr-may-mozz-rallado',  'cm-may-mozz-rallado',  'carnemart', 339.90, CURRENT_DATE, true),
  ('cm-pr-may-crema-delphy',  'cm-may-crema-delphy',  'carnemart', 159.90, CURRENT_DATE, true),
  ('cm-pr-may-picada-res',    'cm-may-picada-res',    'carnemart', 156.90, CURRENT_DATE, true),
  ('cm-pr-may-carne-asar-may','cm-may-carne-asar-may','carnemart', 156.90, CURRENT_DATE, true),
  ('cm-pr-may-fajitas-arr',   'cm-may-fajitas-arr',   'carnemart', 168.90, CURRENT_DATE, true),
  ('cm-pr-may-rib-eye-sh',    'cm-may-rib-eye-sh',    'carnemart', 224.90, CURRENT_DATE, true),
  ('cm-pr-may-pechuga-prm-sh','cm-may-pechuga-prm-sh','carnemart',  84.90, CURRENT_DATE, true),
  ('cm-pr-may-hamb-pollo',    'cm-may-hamb-pollo',    'carnemart', 109.90, CURRENT_DATE, true),
  ('cm-pr-may-picada-cerdo-may','cm-may-picada-cerdo-may','carnemart',86.90, CURRENT_DATE, true),
  ('cm-pr-may-chiles-jal',    'cm-may-chiles-jal',    'carnemart',  37.90, CURRENT_DATE, true),
  ('cm-pr-may-camaron-crudo', 'cm-may-camaron-crudo', 'carnemart', 199.90, CURRENT_DATE, true),
  ('cm-pr-may-menudo-cubic',  'cm-may-menudo-cubic',  'carnemart',  86.90, CURRENT_DATE, true),
  ('cm-pr-may-menudo-trozo',  'cm-may-menudo-trozo',  'carnemart',  89.90, CURRENT_DATE, true),
  ('cm-pr-may-chuleta-ahum',  'cm-may-chuleta-ahum',  'carnemart',  94.90, CURRENT_DATE, true),
  ('cm-pr-may-jamon-dixie',   'cm-may-jamon-dixie',   'carnemart', 126.90, CURRENT_DATE, true),
  ('cm-pr-may-salch-viena',   'cm-may-salch-viena',   'carnemart',  46.90, CURRENT_DATE, true),

  -- Domingazo de Regalo
  ('cm-pr-dom-salch-asar-16', 'cm-dom-salch-asar-16', 'carnemart', 127.50, CURRENT_DATE, true),
  ('cm-pr-dom-chistorra',     'cm-dom-chistorra',     'carnemart',  79.90, CURRENT_DATE, true),
  ('cm-pr-dom-chorizo-arg',   'cm-dom-chorizo-arg',   'carnemart', 147.90, CURRENT_DATE, true),
  ('cm-pr-dom-salch-asar-800','cm-dom-salch-asar-800','carnemart',  69.90, CURRENT_DATE, true),
  ('cm-pr-dom-queso-amer',    'cm-dom-queso-amer',    'carnemart',  29.90, CURRENT_DATE, true),

  -- Boneless y Alitas
  ('cm-pr-bon-nugget-select', 'cm-bon-nugget-select', 'carnemart',  84.90, CURRENT_DATE, true),
  ('cm-pr-bon-tender-premium','cm-bon-tender-premium','carnemart', 149.90, CURRENT_DATE, true),
  ('cm-pr-bon-fuego',         'cm-bon-fuego',         'carnemart', 149.90, CURRENT_DATE, true),
  ('cm-pr-bon-alita-enchilada','cm-bon-alita-enchilada','carnemart',73.90, CURRENT_DATE, true),
  ('cm-pr-bon-alita-natural', 'cm-bon-alita-natural', 'carnemart',  89.90, CURRENT_DATE, true),
  ('cm-pr-bon-alita-botanera','cm-bon-alita-botanera','carnemart',  84.90, CURRENT_DATE, true),

  -- Carnes y Empanizados
  ('cm-pr-emp-arrachera-cerdo','cm-emp-arrachera-cerdo','carnemart',124.90, CURRENT_DATE, true),
  ('cm-pr-emp-chuleta-lomo',  'cm-emp-chuleta-lomo',  'carnemart',  78.90, CURRENT_DATE, true),
  ('cm-pr-emp-adobada-rosa',  'cm-emp-adobada-rosa',  'carnemart', 105.90, CURRENT_DATE, true),
  ('cm-pr-emp-cana-lomo',     'cm-emp-cana-lomo',     'carnemart',  98.90, CURRENT_DATE, true),
  ('cm-pr-emp-costilla-parr', 'cm-emp-costilla-parr', 'carnemart', 108.90, CURRENT_DATE, true),
  ('cm-pr-emp-hamb-western-12','cm-emp-hamb-western-12','carnemart',109.90, CURRENT_DATE, true),
  ('cm-pr-emp-hamb-sonora-8', 'cm-emp-hamb-sonora-8', 'carnemart', 119.90, CURRENT_DATE, true),
  ('cm-pr-emp-tilapia',       'cm-emp-tilapia',       'carnemart', 119.90, CURRENT_DATE, true),

  -- Bebidas y Abarrotes
  ('cm-pr-beb-pepsi-600',     'cm-beb-pepsi-600',     'carnemart',  34.50, CURRENT_DATE, true),
  ('cm-pr-beb-pepsi-2l',      'cm-beb-pepsi-2l',      'carnemart',  97.90, CURRENT_DATE, true),
  ('cm-pr-beb-be-light',      'cm-beb-be-light',      'carnemart',  46.90, CURRENT_DATE, true),
  ('cm-pr-beb-agua-nb',       'cm-beb-agua-nb',       'carnemart',  97.50, CURRENT_DATE, true),
  ('cm-pr-beb-pan-nb',        'cm-beb-pan-nb',        'carnemart',  43.90, CURRENT_DATE, true),
  ('cm-pr-beb-salsa-pizza',   'cm-beb-salsa-pizza',   'carnemart',  99.90, CURRENT_DATE, true),
  ('cm-pr-beb-salsas-zaasc',  'cm-beb-salsas-zaasc',  'carnemart',  43.90, CURRENT_DATE, true),
  ('cm-pr-beb-mi-catsup',     'cm-beb-mi-catsup',     'carnemart',  89.90, CURRENT_DATE, true),
  ('cm-pr-beb-champinon',     'cm-beb-champinon',     'carnemart', 149.90, CURRENT_DATE, true),

  -- Ofertones
  ('cm-pr-of-mil-pollo',      'cm-of-mil-pollo',      'carnemart',  99.90, CURRENT_DATE, true),
  ('cm-pr-of-pechuga-iqf',    'cm-of-pechuga-iqf',    'carnemart',  87.90, CURRENT_DATE, true),
  ('cm-pr-of-pierna-muslo',   'cm-of-pierna-muslo',   'carnemart',  28.90, CURRENT_DATE, true),
  ('cm-pr-of-jamon-fs',       'cm-of-jamon-fs',       'carnemart', 199.90, CURRENT_DATE, true),
  ('cm-pr-of-bistec-res',     'cm-of-bistec-res',     'carnemart', 162.90, CURRENT_DATE, true),
  ('cm-pr-of-carne-picada',   'cm-of-carne-picada',   'carnemart', 160.90, CURRENT_DATE, true),
  ('cm-pr-of-camaron-med',    'cm-of-camaron-med',    'carnemart', 160.90, CURRENT_DATE, true),
  ('cm-pr-of-pierna-sh',      'cm-of-pierna-sh',      'carnemart',  54.90, CURRENT_DATE, true),
  ('cm-pr-of-gouda-bipack',   'cm-of-gouda-bipack',   'carnemart', 174.90, CURRENT_DATE, true),

  -- Quesos
  ('cm-pr-qso-chihuahua',     'cm-qso-chihuahua',     'carnemart', 479.90, CURRENT_DATE, true),
  ('cm-pr-qso-crema-190',     'cm-qso-crema-190',     'carnemart',  39.90, CURRENT_DATE, true),
  ('cm-pr-qso-mozzarella',    'cm-qso-mozzarella',    'carnemart', 129.90, CURRENT_DATE, true),
  ('cm-pr-qso-tres-quesos',   'cm-qso-tres-quesos',   'carnemart', 329.90, CURRENT_DATE, true),
  ('cm-pr-qso-gouda',         'cm-qso-gouda',         'carnemart', 152.90, CURRENT_DATE, true),
  ('cm-pr-qso-manchego',      'cm-qso-manchego',      'carnemart', 154.90, CURRENT_DATE, true),

  -- Molidas
  ('cm-pr-mol-sirloin',       'cm-mol-sirloin',       'carnemart', 138.90, CURRENT_DATE, true),
  ('cm-pr-mol-especial',      'cm-mol-especial',      'carnemart', 128.90, CURRENT_DATE, true),
  ('cm-pr-mol-comercial',     'cm-mol-comercial',     'carnemart', 104.90, CURRENT_DATE, true),
  ('cm-pr-mol-pulpas',        'cm-mol-pulpas',        'carnemart', 129.90, CURRENT_DATE, true),
  ('cm-pr-mol-cerdo',         'cm-mol-cerdo',         'carnemart',  83.90, CURRENT_DATE, true),
  ('cm-pr-mol-pollo',         'cm-mol-pollo',         'carnemart',  97.90, CURRENT_DATE, true)
ON CONFLICT (id) DO NOTHING;

-- ─── Verificación rápida (se imprime al ejecutar) ─────────────────────────────
SELECT
  (SELECT nombre FROM puestos WHERE id = 'carnemart')                                      AS tienda,
  (SELECT telefono_contacto FROM puestos WHERE id = 'carnemart')                           AS telefono,
  (SELECT COUNT(*) FROM puesto_horario_atencion WHERE puesto_id = 'carnemart')             AS dias_horario,
  (SELECT COUNT(*) FROM productos WHERE id LIKE 'cm-%')                                    AS productos,
  (SELECT COUNT(*) FROM precios WHERE puesto_id = 'carnemart' AND activo = true)           AS precios,
  (SELECT nombre FROM usuarios WHERE puesto_id = 'carnemart' AND rol = 'tienda' LIMIT 1)   AS usuario_tienda;

COMMIT;
