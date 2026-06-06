# Roadmap — pendientes (parqueado ~jul 2026)

Decisión jun-2026: dejar que el negocio salga a flote con lo informal antes de
invertir en formalización + pagos. Retomar el mes siguiente.

## 1. Pagos en línea
- **Pasarela:** Mercado Pago (tarjetas + OXXO + SPEI; confianza local) — o Stripe.
- Backend: crear cobro (monto = total del pedido) → checkout → **webhook** confirma → marcar pedido pagado. Estados: pendiente/aprobado/rechazado.
- Móvil: SDK (dev build) o WebView con checkout hospedado. Web: checkout hospedado.
- Mantener **efectivo contra entrega** como opción default.
- Apple/Google NO cobran comisión (bienes físicos → entrega real). ✅
- Sinergia: pedido prepagado = elimina pedidos falsos.

## 2. Verificación de teléfono (anti-abuso)
- **Twilio Verify** (recomendado): OTP por SMS o WhatsApp, **todo por backend** → web y Expo solo pegan a la API propia (sin SDK nativo). Alt: Firebase Phone Auth (más latoso en Expo).
- Backend: endpoints `enviar-codigo` / `confirmar-codigo`, columna `verificado` en usuarios, env vars Twilio en Railway.
- **Gate:** exigir teléfono verificado para **crear pedido** (mata pedidos falsos).
- ⚠️ **Rate-limit** en `enviar-codigo` (máx X por teléfono/IP) para evitar toll fraud (quemar saldo de SMS). Twilio Verify trae anti-fraude integrado.
- Costo: ~$0.05–0.10 USD por verificación.

## 4. Cuenta de mesero (POS para restaurantes)
Para cuando el cliente no trae celular: el mesero toma el pedido desde el suyo.
- **Auth:** sub-cuentas `rol='mesero'` (nombre + PIN), creadas por la tienda, scoped a su puesto. Cada mesero su login (no comparte el PIN del dueño; se sabe quién atendió).
- **Permisos del mesero:** tomar pedido (elegir mesa + productos del menú con buscador → cocina), pedir/cerrar cuenta, ver comandas. NO crear/borrar mesas (eso es del dueño).
- **Backend:** endpoints de pedido/cuenta/comanda que hoy van por token QR (anónimo) deben aceptar también sesión de mesero actuando sobre una mesa por id. `/api/tienda/meseros` CRUD (la tienda crea/lista/borra meseros). Permitir rol mesero en `getUsuarioFromSession`/auth.
- **UI mesero (móvil):** login → lista de mesas → abrir mesa → menú+carrito → enviar a cocina → comandas → cerrar cuenta.
- **UI tienda:** sección para gestionar sus meseros (alta nombre+PIN, lista, baja).

## 5. Mesas: recibos y tickets (pendiente)
- Cuenta → recibo como los otros; imprimir (web: print del navegador; móvil: expo-print AirPrint/red; térmica BT ESC/POS = módulo nativo aparte) o compartir (PDF/imagen).
- Historial: la cuenta de mesa como UNA venta con items juntos (agrupar por cuenta_id), no un pedido por envío.
- QR en móvil: modal zoom + descargar/compartir (paridad con web), para tiendas premium.

## 6. Formalización fiscal (consultar contador)
- Por ahora seguir en **RESICO persona física** + dar de alta la actividad de Mercadito en el RFC.
- Antes de prender pagos: contador chico + facturación CFDI (RESICO PF debe emitir).
- Empresa (persona moral) solo cuando crezca mucho o se formalice la sociedad con Fernando.
