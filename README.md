# Mercadito

Plataforma de delivery para mercados locales. Conecta clientes con puestos del mercado y repartidores en Sahuayo, Jiquilpan y Venustiano Carranza, Michoacan.

## Problema

Las tiendas locales y puestos de mercado pierden ventas ante empresas grandes porque no tienen presencia digital. Los clientes quieren comprar productos frescos del mercado pero no siempre pueden ir en persona.

## Solucion

Una app web (PWA) donde:
- **Clientes** hacen su lista de compras del mercado y la reciben en su domicilio
- **Tiendas/Puestos** publican sus productos y actualizan precios diariamente
- **Repartidores** compran los productos en el mercado y los entregan
- **Admin** monitorea ventas, ganancias y aprueba nuevas tiendas

## Modelo de negocio

| Concepto | Detalle |
|----------|---------|
| Ingreso principal | Tarifa de envio por zona ($25-$55 MXN) |
| Pago a tiendas | Subtotal de productos (cash) |
| Minimo de compra | $150 MXN |
| Pago del cliente | Efectivo contra entrega |
| Futuro | Suscripcion para tiendas |

## Zonas de cobertura

- Sahuayo Centro — $25 MXN envio, 30-45 min
- Sahuayo Colonias — $35 MXN envio, 45-60 min
- Jiquilpan — $50 MXN envio, 60-90 min
- Venustiano Carranza — $55 MXN envio, 60-90 min

## Pantallas

### `/cliente` — Comprar
- Catalogo de productos por categoria (deslizable en movil)
- Carrito con cantidades editables
- Mapa interactivo para marcar punto de entrega
- Checkout con nombre, WhatsApp, direccion y notas
- Tab "Mis Pedidos" con estado en tiempo real y opcion de cancelar

### `/tienda` — Mi Tienda
- Login con telefono + PIN
- Agregar productos nuevos con precio
- Actualizar precios existentes (tap para editar inline)
- Ver pedidos que incluyen productos de su tienda
- Catalogo con estadisticas

### `/tienda/registro` — Registrar Tienda
- Formulario publico para que dueños de puestos se registren
- Queda pendiente de aprobacion por admin
- Una vez aprobada, pueden entrar a `/tienda`

### `/repartidor` — Panel Repartidor
- Login con telefono + PIN
- Pedidos agrupados por zona y ordenados por llegada
- Tomar/soltar pedidos (multiples repartidores simultaneos)
- Filtros: Todos, Mis pedidos, Sin asignar
- Botones de WhatsApp y Llamar al cliente
- Avanzar estado: Pendiente -> Comprando -> En camino -> Entregado
- Auto-refresh cada 30 segundos

### `/admin` — Dashboard
- Login con telefono + PIN
- **Resumen**: pedidos, ventas, clientes, productos mas vendidos
- **Finanzas**: ganancia por envios vs pago a tiendas, desglose por tienda, ventas por dia
- **Tiendas**: aprobar/rechazar registros, ver ventas por tienda
- **Equipo**: estadisticas por repartidor (entregas, total manejado)

## Stack tecnico

| Tecnologia | Uso |
|------------|-----|
| Next.js 16 | Framework fullstack (App Router) |
| TypeScript | Tipado |
| Tailwind CSS | Estilos (mobile-first) |
| PostgreSQL | Base de datos |
| Docker | Deploy en produccion |
| Leaflet | Mapa interactivo |

## Estructura del proyecto

```
src/
  app/
    cliente/page.tsx      — Vista del cliente
    repartidor/page.tsx   — Panel del repartidor
    tienda/page.tsx       — Dashboard de tienda
    tienda/registro/      — Registro publico de tiendas
    admin/page.tsx        — Dashboard administrativo
    api/
      auth/               — Login/logout/sesion
      pedidos/            — CRUD de pedidos
      productos/          — Catalogo de productos
      precios/            — Actualizacion de precios
      tiendas/            — Registro y aprobacion
      mis-pedidos/        — Pedidos del cliente
      admin/stats/        — Estadisticas admin
      zonas/              — Zonas de entrega
      puestos/            — Lista de puestos
  components/
    Header.tsx            — Header global
    LoginRepartidor.tsx   — Login del repartidor
    MapaEntrega.tsx       — Mapa interactivo (Leaflet)
    SessionProvider.tsx   — Context de sesion
  lib/
    auth.ts               — Autenticacion y sesiones
    db.ts                 — Pool de PostgreSQL + migraciones
    types.ts              — Interfaces TypeScript
```

## Seguridad

- Sesiones server-side con cookie httpOnly
- Al hacer login se invalidan sesiones anteriores del mismo usuario
- APIs filtran datos por rol (cliente solo ve sus pedidos, tienda solo sus productos, etc.)
- Solo repartidor/admin pueden cambiar estado de pedidos
- Solo el dueno puede cancelar su pedido (si esta pendiente)
- Tiendas solo pueden editar precios de su propio puesto
- Productos solo muestran precios de tiendas aprobadas y activas
- Registro de tiendas requiere aprobacion del admin

## Deploy

```bash
# Clonar
git clone <repo-url>
cd mercadito

# Variables de entorno
export DATABASE_URL=postgresql://user:pass@host:5432/mercadito

# Docker
docker compose up -d --build
# La app corre en puerto 3100

# Desarrollo local
npm install
npm run dev
```

## Roles y acceso

| Rol | Acceso | Autenticacion |
|-----|--------|---------------|
| Cliente | `/cliente` | Nombre + telefono (auto-registro) |
| Tienda | `/tienda` | Telefono + PIN |
| Repartidor | `/repartidor` | Telefono + PIN |
| Admin | `/admin` | Telefono + PIN |

---

Hecho con Next.js para mercados locales de Michoacan.
