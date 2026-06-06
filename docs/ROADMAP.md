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

## 3. Formalización fiscal (consultar contador)
- Por ahora seguir en **RESICO persona física** + dar de alta la actividad de Mercadito en el RFC.
- Antes de prender pagos: contador chico + facturación CFDI (RESICO PF debe emitir).
- Empresa (persona moral) solo cuando crezca mucho o se formalice la sociedad con Fernando.
