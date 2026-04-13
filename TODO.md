# TODO — Mercadito

## Inmediato (antes de que Fernando llene productos)

- [ ] **Fernando llena catalogo** — Minimo 30 productos con precio desde /tienda
- [ ] **Probar flujo completo** — Adrian hace pedido, Fernando lo procesa hasta "Entregado"
- [ ] **Hilda prueba** — Entra a /repartidor, toma un pedido, completa flujo
- [ ] **Verificar notificaciones** — Fernando y Hilda aceptan permisos de notificacion en su cel
- [ ] **Instalar como app** — Los 3 guardan mercadito.cx como app en su telefono

## Bugs conocidos por revisar

- [ ] Verificar que el editor de pedidos funcione bien en movil (teclado numerico, scroll)
- [ ] Verificar que la busqueda de direcciones devuelva resultados utiles en Sahuayo/Jiquilpan
- [ ] Verificar que las notificaciones suenan en Android e iPhone con la app en segundo plano
- [ ] Probar pedido en horario nocturno (10-11 PM) — verificar que el recargo se aplique
- [ ] Probar pedido fuera de horario (despues de 11 PM) — verificar que se bloquee

## Semana 1 — Lanzamiento suave

- [ ] Mandar mensaje de WhatsApp a 10-15 conocidos (mensajes en ESTRATEGIA-LANZAMIENTO.md)
- [ ] Primer pedido real de un cliente externo
- [ ] Revisar en /admin que las finanzas cuadren
- [ ] Ajustar precios de envio si son muy caros o baratos para la zona
- [ ] Definir horario de atencion y comunicarlo (sugerido: 8am-3pm entre semana)

## Semana 2 — Evaluar y crecer

- [ ] Publicar en Facebook (post listo en ESTRATEGIA-LANZAMIENTO.md)
- [ ] Revisar metricas en /admin: pedidos/dia, ticket promedio, cancelaciones
- [ ] Pedir feedback a los primeros clientes por WhatsApp
- [ ] Agregar productos que los clientes pidan y no esten en el catalogo
- [ ] Decidir si se necesita ampliar horario o zonas

## Features pendientes por prioridad

### Alta prioridad
- [ ] **Notificaciones push reales** (Firebase Cloud Messaging) — para que suene aunque no tengan la app abierta
- [ ] **WhatsApp Business API** — enviar confirmacion automatica al cliente cuando su pedido cambie de estado
- [ ] **Recibo/resumen por WhatsApp** — al entregar, mandar resumen del pedido al cliente
- [ ] **Foto del producto** — que Fernando pueda subir fotos desde /tienda para que el cliente vea lo que compra

### Media prioridad
- [ ] **Historial de precios** — ver como han cambiado los precios de un producto
- [ ] **Busqueda de productos** — barra de busqueda en la vista del cliente ademas de categorias
- [ ] **Pago por transferencia** — agregar opcion de pago con CLABE o QR de banco
- [ ] **Reportes exportables** — descargar CSV desde /admin con ventas por dia/semana
- [ ] **Multiples origenes por pedido** — si un pedido tiene productos de 2 tiendas, calcular ruta optima
- [ ] **Favoritos** — que el cliente guarde productos que compra seguido

### Baja prioridad (futuro)
- [ ] **Suscripcion para tiendas** — cobro mensual, gestion manual en cash al principio
- [ ] **Programa de lealtad** — descuentos para clientes frecuentes
- [ ] **Repartidor GPS en tiempo real** — que el cliente vea donde va el repartidor en el mapa
- [ ] **Chat en la app** — entre cliente y repartidor sin salir a WhatsApp
- [ ] **App nativa** (React Native o similar) — para push notifications reales y mejor experiencia
- [ ] **Panel de analytics** — graficas de crecimiento, retention, etc
- [ ] **Multi-idioma** — por si se expande a zonas con hablantes de purepecha

## Infraestructura

- [ ] **Dominio SSL** — verificar que mercadito.cx tenga HTTPS (necesario para PWA y GPS)
- [ ] **Backups de DB** — programar backup diario de PostgreSQL
- [ ] **Monitoreo** — alertas si el contenedor se cae
- [ ] **OSRM propio** — el servidor publico de OSRM tiene limite de uso, eventualmente hostear uno propio
- [ ] **CDN para imagenes** — cuando se agreguen fotos de productos

## Notas

- Las guias para Fernando y Hilda estan en GUIA-FERNANDO.md y GUIA-HILDA.md
- La estrategia de marketing esta en ESTRATEGIA-LANZAMIENTO.md
- Contexto tecnico completo en CONTEXTO-PRIVADO.md (no se sube a git)
- Para continuar con Claude, decir "lee CONTEXTO-PRIVADO.md"
