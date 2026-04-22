# Mercadito Mobile

App React Native con Expo. Usa el mismo backend Next.js (`https://mercadito.cx`).

## Arrancar en local

```bash
cd mobile
npm install
npx expo install --fix   # sincroniza versiones con el SDK
npm run start
```

Luego escanea el QR con la app **Expo Go** (iOS / Android).

## Estructura

- `app/` — rutas con **expo-router** (file-based, similar a Next.js App Router)
  - `index.tsx` — redirige a `/login` o `/(tabs)/home` segun sesion
  - `login.tsx` — login de cliente (nombre + telefono)
  - `(tabs)/` — tabs protegidas (home, pedidos, perfil)
- `src/api/` — cliente HTTP + endpoints (`client.ts`, `auth.ts`, `catalogo.ts`)
- `src/contexts/SessionContext.tsx` — provider de sesion
- `app.json` — `extra.apiBaseUrl` controla a que backend apunta

## Auth

A diferencia de la web (cookie HttpOnly), aquí el backend devuelve `sessionId` en el body del `POST /api/auth` y se guarda en **`expo-secure-store`**. El cliente lo manda en el header `X-Session-Token` en cada request.

El backend soporta los dos: cookie (web) y header (mobile).

## Transparencia de precios

Igual que la web: el listado muestra el **precio real** de la tienda y la comisión aparece como renglón aparte ("Servicio Mercadito") en el desglose del carrito. La lógica vive en `src/lib/comision.ts` (misma formula que el backend) y el estado del carrito en `src/contexts/CartContext.tsx`.

## Por hacer

- Filtros por categoría / búsqueda
- Crear pedido (`POST /api/pedidos`) desde el carrito
- Dirección con mapa (expo-location + react-native-maps)
- Notificaciones push (expo-notifications)
- Pagos con Stripe o Mercado Pago cuando se habiliten en el backend
- App icon / splash / branding propio

## Deploy

- **Desarrollo**: Expo Go + `npm run start`
- **Producción**: EAS Build (`eas build --platform android|ios`) y OTA updates via EAS Update
