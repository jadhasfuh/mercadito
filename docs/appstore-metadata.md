# Metadata para App Store Connect — Mercadito iOS

Borrador en `es-MX` (idioma primario). Apple permite versiones en
otros idiomas; con `es-MX` cubrimos el mercado objetivo.

## Información de la app

| Campo | Valor | Límite |
|---|---|---|
| Nombre | `Mercadito — Mercado a domicilio` | 30 car. |
| Subtítulo | `Tu mercado local, entregado` | 30 car. |
| Bundle ID | `mx.mercadito.cx` | — |
| SKU | `mercadito-ios` (libre) | — |
| Categoría principal | Comida y bebidas | — |
| Categoría secundaria | Compras | — |
| Clasificación por edad | 4+ | — |
| Precio | Gratis | — |

## Texto promocional (170 car., editable sin nueva revisión)

```
Compra fruta, verdura, carne y abarrotes del mercado local de Sahuayo,
Jiquilpan y V. Carranza sin salir de casa. Pago al recibir, sin tarjeta.
```

## Descripción (4000 car.)

```
Mercadito conecta a los puestos del mercado y tiendas locales de Sahuayo,
Jiquilpan y Venustiano Carranza con clientes que quieren recibir sus
compras a domicilio. Sin tarjeta, sin comisiones ocultas, paga en
efectivo al repartidor cuando entregue tu pedido.

CÓMO FUNCIONA
• Arma tu lista combinando productos de varios puestos del mercado.
• Confirma tu dirección en el mapa.
• Un repartidor compra por ti, te avisa cuando va en camino y te entrega.
• Pagas en efectivo al recibir.

PARA TIENDAS Y PUESTOS DEL MERCADO
• Registro gratis desde la app. Pendiente de aprobación del administrador.
• Sube productos con foto, precio, sección y horarios.
• Recibe pedidos en tiempo real con notificación push.
• Edita precios cuando quieras.

PARA REPARTIDORES
• Ve los pedidos disponibles por zona.
• Tómalos con un toque, llama o manda WhatsApp al cliente.
• Marca avance: comprando → en camino → entregado.

ZONAS DE COBERTURA
Sahuayo Centro y colonias, Jiquilpan y Venustiano Carranza, Michoacán.

PRECIOS TRANSPARENTES
El precio que ves es el de la tienda. La comisión de Mercadito aparece
desglosada como "Servicio Mercadito" en el resumen del pedido. El envío
se calcula por distancia desde el mercado hasta tu domicilio.

PRIVACIDAD
Solo recolectamos lo necesario para entregar tu pedido: nombre, teléfono,
dirección y ubicación que tú nos das. No vendemos tus datos. Puedes
borrar tu cuenta desde la pestaña Perfil en cualquier momento.

¿Dudas? Escríbenos por WhatsApp desde la pantalla de soporte de la app
o al correo adriancar75@hotmail.com.
```

## Palabras clave (100 car., separadas por coma sin espacios)

```
mercado,sahuayo,jiquilpan,domicilio,delivery,abarrotes,fruta,verdura,michoacan,puesto,tienda,reparto
```

## URLs (obligatorias)

- Sitio de soporte: `https://mercadito.cx`
- URL de marketing (opcional): `https://mercadito.cx`
- Política de privacidad: `https://mercadito.cx/privacidad`

## Información para App Review

```
Demo accounts (PIN: pedir a Adrián antes de envío):

Cliente:
  Teléfono: 5555555555
  PIN: 123456

Tienda:
  Teléfono: <pendiente>
  PIN: <pendiente>

Repartidor:
  Teléfono: <pendiente>
  PIN: <pendiente>

Notas para el revisor:
- La app es multi-rol. El login distingue cliente (nombre + tel + PIN)
  de tienda/repartidor (tel + PIN).
- El pago es 100% en efectivo contra entrega de bienes físicos
  (groceries del mercado local). No requiere compras in-app (IAP).
- Las zonas de entrega están limitadas a Sahuayo, Jiquilpan y
  V. Carranza, Michoacán, México. Los pedidos fuera de cobertura
  no se aceptan.
- "Eliminar mi cuenta" está disponible en Perfil → Cuenta para los 3
  roles, cumple guideline 5.1.1(v).
```

## Notas de la versión (4000 car.)

Para la versión 1.0.57 (primera entrega):

```
¡Bienvenido a Mercadito! Esta es nuestra primera versión para iPhone y
iPad. Pide del mercado local de Sahuayo, Jiquilpan o V. Carranza y
recibe en tu domicilio. Paga en efectivo al recibir.
```

## App Privacy (Privacy Nutrition Labels) — declarar en ASC

Datos vinculados a tu identidad:
- **Datos de contacto**: nombre, número de teléfono.
- **Identificadores**: ID de usuario, token push (vinculado al user_id).
- **Ubicación**: ubicación precisa (solo cuando el usuario la comparte).
- **Compras**: historial de pedidos (vinculado a la cuenta).
- **Contenido del usuario**: fotos (subidas por tiendas para productos).

Uso:
- Funcionalidad de la app (todos los anteriores).
- No usamos los datos para tracking, publicidad o analytics de terceros.

Datos **no recolectados**:
- Contactos, biometría, historial de navegación, datos de salud,
  ubicación en segundo plano, datos financieros, identificadores
  publicitarios.

## Screenshots requeridos

iPhone:
- **6.9"** (iPhone 16 Pro Max): 1320×2868 px, mínimo 3 — máximo 10.
- **6.5"** (iPhone 14 Plus / 11 Pro Max): 1284×2778 px o 1242×2688.

iPad (porque `supportsTablet: true`):
- **13"** (iPad Pro M4): 2064×2752 px.

Cubrir las 3 vistas: Cliente (catálogo, carrito, mapa, pedido en curso),
Tienda (productos, mi tienda, pedidos), Repartidor (lista de pedidos,
detalle, entregar).

## Build / Submit

```bash
cd mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Luego en ASC:
1. Asignar el build a la versión 1.0.57.
2. Llenar metadata (este documento).
3. Subir screenshots.
4. Llenar App Privacy.
5. Enviar a revisión.
