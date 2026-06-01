-- Actualiza los precios de Subway (puesto-5bbd2edd) al tarifario nuevo.
-- Cada tamaño es un producto independiente (subsección Sub15cm / Sub30cm),
-- así que se actualiza la fila de `precios` activa de cada producto.
--
-- También colapsa el precio duplicado de "Costillas BBQ 15 cm" (tenía 2
-- filas activas) dejando una sola.
--
-- Idempotente: solo toca filas activas; volver a correrlo deja los mismos
-- valores.
--
-- Aplicar:
--   ssh root@157.173.199.130 \
--     "docker exec -i n8n-postgres-1 psql -U n8n_user -d mercadito" \
--     < scripts/fix-precios-subway.sql

BEGIN;

-- Colapsa duplicados activos de Costillas BBQ 15 cm: conserva la fila más
-- antigua (min ctid) y borra el resto. `precios` no es referenciada por
-- ninguna FK, así que es seguro borrarla.
DELETE FROM precios
WHERE producto_id = 'sub-costillas-bbq-15-cm-31ec'
  AND puesto_id = 'puesto-5bbd2edd'
  AND activo = true
  AND ctid <> (
    SELECT min(ctid) FROM precios
    WHERE producto_id = 'sub-costillas-bbq-15-cm-31ec'
      AND puesto_id = 'puesto-5bbd2edd'
      AND activo = true
  );

-- ── 15 cm ──
UPDATE precios SET precio = 65  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='deleite-vegetariano-15-cm-c206';
UPDATE precios SET precio = 90  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='milanesa-de-pollo-3-quesos-15-cm-b048';
UPDATE precios SET precio = 85  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-atun-15-cm-ca34';
UPDATE precios SET precio = 110 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-boneless-hot-15-cm-0920';
UPDATE precios SET precio = 110 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-carne-y-queso-15cm-5ad7';
UPDATE precios SET precio = 105 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-chicken-bacon-ranch-15cm-439b';
UPDATE precios SET precio = 95  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-costillas-bbq-15-cm-31ec';
UPDATE precios SET precio = 85  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-de-pizza-15-cm-f822';
UPDATE precios SET precio = 90  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-italiano-b-m-t-15-cm-de6a';
UPDATE precios SET precio = 85  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-jamon-15-cm-05b6';
UPDATE precios SET precio = 85  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-jamon-de-pavo-15-cm-7e54';
UPDATE precios SET precio = 85  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-pollo-15-cm-811b';
UPDATE precios SET precio = 95  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-pollo-estilo-teriyaki-15cm-c7a4';
UPDATE precios SET precio = 95  WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-pollo-parmesano-15-cm-f47a';

-- ── footlong / 30 cm ──
UPDATE precios SET precio = 125 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='deleite-vegetariano-footlong-30-cm-0651';
UPDATE precios SET precio = 160 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='milanesa-de-pollo-3-quesos-footlong-30-cm-0a5b';
UPDATE precios SET precio = 145 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-atun-footlong-30-cm-bb32';
UPDATE precios SET precio = 175 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-boneless-hot-footlong-30cm-3501';
UPDATE precios SET precio = 170 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-carne-y-queso-footlong-30-cm-fe2d';
UPDATE precios SET precio = 175 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-chicken-bacon-ranch-footlong-30-cm-27d0';
UPDATE precios SET precio = 145 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-de-pizza-flootlong-30-cm-9f45';
UPDATE precios SET precio = 150 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-italiano-b-m-t-footlong-30cm-8791';
UPDATE precios SET precio = 145 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-jamon-de-pavo-footlong-30-cm-d57a';
UPDATE precios SET precio = 145 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-jamon-footlong-30-cm-a495';
UPDATE precios SET precio = 160 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-pollo-estilo-teriyaki-footlong-a858';
UPDATE precios SET precio = 160 WHERE puesto_id='puesto-5bbd2edd' AND activo=true AND producto_id='sub-pollo-parmesano-footlong-3676';

COMMIT;
