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

- **Login multi-rol**: toggle Cliente / Repartidor.
  - Cliente: nombre + teléfono.
  - Repartidor: teléfono + PIN.
  - Usa `/api/auth` con `X-Session-Token` guardado en `expo-secure-store`.
- **Push notifications** (expo-notifications): al loguearse, pide permiso, obtiene `ExponentPushToken` y lo POSTea a `/api/push/register`. Cuando un cliente crea un pedido, el backend dispara push a todos los repartidores activos.
- **Inicio**: chips de categorías + productos con todos los precios por tienda, botón `+` / stepper para agregar al carrito.
- **Carrito**: lista editable, desglose en tiempo real de "Productos" vs "Servicio Mercadito" (transparencia igual que la web).
- **Checkout** (`app/checkout.tsx`): dirección, selector de zona de entrega (4 zonas hardcoded — ver nota abajo), método de pago (efectivo/tarjeta con recargo 4%), resumen final y `POST /api/pedidos`.
- **Mis pedidos**: lista con polling cada 15s, badges de estado, desglose completo, nombre del repartidor cuando aplica.
- **Perfil**: datos del cliente y cerrar sesión.

### Vista Repartidor (`app/(repartidor)/`)

- **Pedidos**: lista de pedidos activos con polling de 15s, filtros Todos / Míos / Sin asignar.
- Acciones por estado: Tomar → Salir a entregar → Marcar entregado.
- Botones de llamar / WhatsApp al cliente, y abrir dirección en Google Maps (usa la lat/lng si viene en `[x, y]` al final).
- **Perfil**: nombre, teléfono, logout.

### Vista Tienda (`app/(tienda)/`)

- **Pedidos**: pedidos activos que incluyen productos de mi puesto, con polling 15s, desglose por producto y botón WhatsApp al cliente.
- **Productos**: lista con foto, chips de Sección/Subsección, buscador. Toca un producto → modal de edición completa (foto cámara/galería, nombre, descripción, precio, sección/subsección, horarios del menú, visible/pausado, eliminar). FAB flotante `+` para agregar nuevo.
- **Agregar producto** (`agregar-producto.tsx`, modal): nombre, categoría, unidad, foto, descripción, sección/subsección, precio, horarios del menú → POST /api/productos.
- **Mi Tienda**:
  - Logo (subida cámara/galería).
  - Datos (nombre, WhatsApp, dirección, referencias).
  - Mapa con marker arrastrable + botón "Mi ubicación" (expo-location + react-native-maps). Reverse geocode autocompleta la dirección.
  - Horario de atención 7 días con siesta opcional.
  - Horarios del menú: CRUD completo (crear Desayuno/Tarde, listar, eliminar).
- **Perfil**: nombre, teléfono, logout.

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

## Cálculo de envío

`src/lib/envio.ts` aplica la misma lógica que el backend web: ceil(distanciaKm) × $12, mínimo $12, cobertura máxima 20 km. La distancia se aproxima con haversine × 1.4 desde cada tienda del pedido hasta el destino (multi-parada). Si quieres distancia exacta por carretera, reemplaza `distanciaMultiParada` con una llamada a OSRM (`https://router.project-osrm.org/route/v1/driving/{waypoints}`).

## Por hacer

- Mapa con ubicación precisa (`expo-location` + `react-native-maps`) para entregas custom sin zona fija.
- Notificaciones push (`expo-notifications`) cuando cambie el estado del pedido.
- Pagos integrados (Stripe / Mercado Pago) cuando el backend los habilite.
- Editar pedido pendiente.
- App icon / splash / branding propio.

## Deploy

- **Dev**: Expo Go + `npm run start` (QR).
- **Producción**: EAS Build (`eas build --platform android|ios`) + EAS Update para OTA.
