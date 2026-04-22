# Mercadito Mobile

App React Native con Expo (SDK 54). Usa el mismo backend Next.js (`https://mercadito.cx`) — sin modificar su API.

## Arrancar en local

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start -c
```

Escanea el QR con **Expo Go** (iOS / Android).

## Flujo implementado

- **Login de cliente** (nombre + teléfono) usando `/api/auth` con `X-Session-Token` guardado en `expo-secure-store`.
- **Inicio**: chips de categorías + productos con todos los precios por tienda, botón `+` / stepper para agregar al carrito.
- **Carrito**: lista editable, desglose en tiempo real de "Productos" vs "Servicio Mercadito" (transparencia igual que la web).
- **Checkout** (`app/checkout.tsx`): dirección, selector de zona de entrega (4 zonas hardcoded — ver nota abajo), método de pago (efectivo/tarjeta con recargo 4%), resumen final y `POST /api/pedidos`.
- **Mis pedidos**: lista con polling cada 15s, badges de estado, desglose completo, nombre del repartidor cuando aplica.
- **Perfil**: datos del cliente y cerrar sesión.

## Estructura

- `app/` — rutas con **expo-router**
  - `index.tsx` — splash + redirige a `/login` o `/(tabs)/home`
  - `login.tsx` — login
  - `checkout.tsx` — confirmar pedido (modal)
  - `(tabs)/` — tabs protegidas: home, carrito, pedidos, perfil
- `src/api/` — cliente HTTP + endpoints (`client.ts`, `auth.ts`, `catalogo.ts`, `pedidos.ts`, `zonas.ts`)
- `src/contexts/` — `SessionContext` y `CartContext` (estado global)
- `src/lib/` — `comision.ts` (misma fórmula que el backend) y `categorias.ts` (mapeo categoría → icono)
- `app.json` — `extra.apiBaseUrl` controla a qué backend apunta

## Transparencia de precios

Igual que la web: precio mostrado es el **real de la tienda**; la comisión aparece como "Servicio Mercadito" en el desglose. Lógica en `src/lib/comision.ts`; cálculo en `src/contexts/CartContext.tsx`.

## Nota sobre zonas

`src/api/zonas.ts` tiene las 4 zonas que vienen en el seed del backend (Sahuayo-Centro, Sahuayo-Colonias, Jiquilpan, Venustiano). Si más adelante el backend expone un endpoint `/api/zonas-entrega`, cámbialo a fetch dinámico.

## Por hacer

- Mapa con ubicación precisa (`expo-location` + `react-native-maps`) para entregas custom sin zona fija.
- Notificaciones push (`expo-notifications`) cuando cambie el estado del pedido.
- Pagos integrados (Stripe / Mercado Pago) cuando el backend los habilite.
- Editar pedido pendiente.
- App icon / splash / branding propio.

## Deploy

- **Dev**: Expo Go + `npm run start` (QR).
- **Producción**: EAS Build (`eas build --platform android|ios`) + EAS Update para OTA.
