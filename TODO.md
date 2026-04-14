# TODO — Mercadito

## Estado actual (13 abril 2026)

- App en mercadito.cx, VPS root@157.173.199.130
- Landing en modo "fase de pruebas" — sin boton de compras, con registro de tiendas
- Solo queda tienda Mercadito (Fernando) en la BD, las de test se borraron
- Publicacion en grupos de Facebook lanzada para captar tiendas
- Mensaje de WhatsApp listo para enviar a contactos

## Lo que se hizo hoy

- [x] Rutas multi-tienda (tienda1 → tienda2 → domicilio) con OSRM waypoints
- [x] Tiempo minimo 30 min + ~10 min compra por tienda
- [x] Mapa: sin barra de busqueda, solo clic en mapa o GPS
- [x] Direccion auto-detectada (no editable) + campo No. de casa obligatorio
- [x] Direcciones de tiendas visibles en Comprar y Mi Lista
- [x] Marcadores de tienda reactivos en mapa del cliente
- [x] Tienda registro: auto-GPS, campo direccion, no. de calle/local, referencias
- [x] Tab "Mi tienda" en /tienda para editar nombre, direccion, WhatsApp, ubicacion
- [x] Mapa visual en /repartidor con link a Google Maps
- [x] Items agrupados por tienda en repartidor con telefono, WhatsApp y Llamar
- [x] Tienda ve que repartidor tomo su pedido
- [x] Tienda solo ve subtotal de SUS productos, no el total del pedido
- [x] Verificar precios al confirmar pedido — modal si cambiaron
- [x] Campos obligatorios: boton deshabilitado si falta nombre, tel, direccion, etc.
- [x] Comision $2/unidad — cliente ve precio+2, tienda ve su precio + aviso
- [x] Desactivar tienda bloquea login, oculta productos, rechaza pedidos
- [x] Quitar compra minima de $150
- [x] Lista negra de palabras prohibidas (~90 palabras)
- [x] Migracion BD: coordenadas reales de mercadito y tienda-test
- [x] Landing: fase de pruebas, boton registro tienda prominente
- [x] Anuncio para Facebook (anuncio-tiendas.html)
- [x] Limpieza BD: solo queda tienda Mercadito

## Fase actual — Captacion de tiendas

- [ ] Revisar /admin diario para ver tiendas nuevas pendientes de aprobacion
- [ ] Aprobar tiendas legitimas, contactar por WhatsApp
- [ ] Pedir a cada tienda nueva que llene sus precios desde /tienda
- [ ] Cuando haya 3-5 tiendas con productos, activar boton de compras para clientes
- [ ] Hacer publicacion orientada a clientes cuando haya catalogo

## Antes de activar pedidos para clientes

- [ ] Fernando llena catalogo — minimo 30 productos con precio desde /tienda
- [ ] Probar flujo completo — Adrian hace pedido, Fernando lo procesa hasta "Entregado"
- [ ] Hilda prueba — entra a /repartidor, toma un pedido, completa flujo
- [ ] Verificar notificaciones en celular
- [ ] Instalar como app en telefono (los 3)
- [ ] Reactivar boton "Hacer mi lista de compras" en landing

## Bugs conocidos

- [ ] Verificar que el editor de pedidos funcione bien en movil
- [ ] Verificar notificaciones en Android e iPhone con app en segundo plano
- [ ] Probar pedido en horario nocturno (recargo) y fuera de horario (bloqueo)

## Features pendientes por prioridad

### Alta prioridad
- [ ] Notificaciones push reales (Firebase Cloud Messaging)
- [ ] WhatsApp Business API — confirmacion automatica al cliente por estado
- [ ] Recibo/resumen por WhatsApp al entregar
- [ ] Foto del producto — subir fotos desde /tienda

### Media prioridad
- [ ] Pago digital (Mercado Pago o transferencia con QR)
- [ ] Comision porcentual a tiendas (cuando haya volumen)
- [ ] Busqueda de productos en vista cliente
- [ ] Reportes exportables CSV desde /admin
- [ ] Favoritos — cliente guarda productos frecuentes
- [ ] Pedidos recurrentes / suscripcion semanal

### Baja prioridad (futuro)
- [ ] Suscripcion para tiendas — cobro mensual
- [ ] Repartidor GPS en tiempo real
- [ ] Chat en la app entre cliente y repartidor
- [ ] App nativa (React Native)
- [ ] Panel de analytics con graficas
- [ ] OSRM propio (el publico tiene limite de uso)

## Modelo de negocio actual

- Comision: $2 por unidad (kg/pieza/litro) — configurado en src/lib/comision.ts
- Envio: $25-60 segun distancia (src/lib/geo.ts)
- Costos fijos: ~$720/mes (VPS + dominio + datos moviles)
- Tiendas: registro gratis, ven aviso de comision en /tienda/precios

## Infraestructura

- VPS: root@157.173.199.130, /opt/mercadito, Docker port 3100
- BD: PostgreSQL en n8n-postgres-1 (compartida con n8n)
- Deploy: `bash deploy.sh` (rsync + docker compose build)
- Dominio: mercadito.cx con HTTPS via Caddy

## Archivos de referencia

- Guias: GUIA-FERNANDO.md, GUIA-HILDA.md
- Estrategia: ESTRATEGIA-LANZAMIENTO.md
- Anuncio: anuncio-tiendas.html (abrir en navegador, screenshot 1080x1080)
- Lista negra: src/lib/lista-negra.ts
- Comision: src/lib/comision.ts
- Contexto privado: CONTEXTO-PRIVADO.md (no se sube a git)
