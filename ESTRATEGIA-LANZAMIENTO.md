# Estrategia de Lanzamiento — Mercadito Fase 1

## Vision general

```
┌─────────────────────────────────────────────────────────┐
│                    MERCADITO                             │
│         Delivery de mercado local a domicilio            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   CLIENTE ──> hace pedido ──> REPARTIDOR ──> compra     │
│      │                           │          en mercado  │
│      │                           │              │       │
│      └── ve estado ◄─────────────┘              │       │
│          en tiempo real        entrega ◄────────┘       │
│                                                         │
│   ADMIN ──> monitorea ventas, aprueba tiendas           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Equipo

| Persona | Rol | Telefono | PIN | Responsabilidades |
|---------|-----|----------|-----|-------------------|
| **Adrian** | Admin | 3531522293 | 1999 | Monitorear ventas, aprobar tiendas, estrategia |
| **Fernando** | Repartidor + Tienda | 3531539602 | 2006 | Llenar catalogo, actualizar precios, hacer entregas |
| **Hilda** | Repartidora | 3531343056 | 1974 | Hacer entregas cuando haya demanda |

```
         ADRIAN (Admin)
            │
      ┌─────┴─────┐
      │            │
  FERNANDO     HILDA
  (Repartidor  (Repartidora)
   + Tienda)
```

---

## Fase 1: Preparacion (Dias 1-3)

### Dia 1 — Llenar el catalogo

**Responsable: Fernando**

Fernando entra a `/tienda` con su telefono y PIN. Desde ahi:

1. **Agregar productos** — Tap en "+ Agregar producto nuevo"
   - Poner nombre, categoria, unidad y precio
   - Empezar por lo mas vendido: tomate, cebolla, limon, pollo, queso
   - **Meta: minimo 30-40 productos** para que un cliente pueda armar una lista de $150+

2. **Orden sugerido para llenar:**

```
Prioridad 1 (dia 1):
├── Verduras: tomate, cebolla, chile, cilantro, papa, zanahoria
├── Frutas: limon, naranja, platano, manzana, mango
├── Carnes: pollo, res, puerco, chorizo
└── Lacteos: queso fresco, crema, leche

Prioridad 2 (dia 2):
├── Granos: frijol, arroz, lenteja
├── Comidas: tamales, enchiladas, pozole
└── Abarrotes: lo que se venda mas
```

3. **Tips para precios:**
   - Poner precio de HOY en el mercado
   - Incluir un margen del 5-10% sobre precio de compra
   - Actualizar diario si cambian (frutas y verduras cambian seguido)

### Dia 2 — Prueba interna

**Responsables: Adrian, Fernando, Hilda**

Cada uno simula ser cliente desde su telefono:

1. Entrar a la app (URL del sitio)
2. Ir a `/cliente`
3. Agregar productos al carrito (meta: $150+)
4. Poner ubicacion en el mapa
5. Confirmar pedido

**Fernando:**
- Entrar a `/repartidor`
- Ver el pedido aparecer
- Tomar el pedido
- Avanzar estados: Pendiente → Comprando → En camino → Entregado

**Adrian:**
- Entrar a `/admin`
- Verificar que los pedidos de prueba aparezcan en el dashboard
- Revisar que las finanzas cuadren (ganancia = envio, pago tienda = subtotal)

**Hilda:**
- Entrar a `/repartidor` con su telefono
- Verificar que ve los mismos pedidos
- Tomar uno y completar el flujo

### Dia 3 — Ajustes

- Corregir precios que esten mal
- Agregar productos que falten
- Probar desde diferentes telefonos/navegadores
- Verificar que el mapa muestre bien las zonas

---

## Fase 2: Lanzamiento suave (Dias 4-10)

### Estrategia: empezar con conocidos

```
Semana 1: 5-10 clientes
├── Familiares cercanos
├── Vecinos de confianza
└── Amigos que compren en el mercado
```

**Como conseguir los primeros clientes:**

1. **WhatsApp directo** — Mandar mensaje personalizado:
   > "Hola! Estamos probando un servicio de mandado del mercado a domicilio.
   > Tu armas tu lista en la app, nosotros compramos y te lo llevamos.
   > Envio desde $25. Minimo $150 de compra.
   > Pruebalo aqui: [URL]"

2. **No publicar en redes todavia** — Primero validar con gente cercana
3. **Pedir feedback directo** — "¿Que te falto? ¿Fue facil de usar?"

### Flujo operativo diario

```
MANANA (7-8 AM)
│
├── Fernando va al mercado
├── Revisa precios del dia
├── Actualiza precios en /tienda que hayan cambiado
│
PEDIDOS ENTRAN (8 AM - 2 PM)
│
├── Fernando y/o Hilda ven pedidos en /repartidor
├── Agrupan por zona (la app ya los agrupa)
├── Toman pedidos y van comprando
│
ENTREGA
│
├── Compran todo de una zona
├── Entregan en orden (el primero que pidio, primero se entrega)
├── Marcan "Entregado" y cobran en efectivo
│
NOCHE
│
└── Adrian revisa dashboard en /admin
    ├── Cuantos pedidos hubo
    ├── Cuanto se gano en envios
    └── Cuanto se debe pagar a tiendas
```

### Tips operativos

- **Agrupar pedidos por zona** reduce gasolina y tiempo
- **No aceptar mas pedidos de los que puedan entregar** en el dia
- Si un producto no esta disponible, **llamar al cliente** (boton WhatsApp en el pedido) y ofrecer sustitucion
- **Cobrar en efectivo** al entregar. Llevar cambio
- Al final del dia, el efectivo cobrado = pago a tiendas + ganancia de envios

---

## Fase 3: Crecimiento (Semanas 2-4)

### Semana 2: Expandir a 15-20 clientes

- Publicar en **Facebook local** (grupos de Sahuayo/Jiquilpan)
- Pedir a clientes satisfechos que **recomienden**
- Considerar **promocion**: primer envio gratis o descuento

### Semana 3: Evaluar metricas

Adrian revisa en `/admin`:

| Metrica | Meta minima | Buena senal |
|---------|-------------|-------------|
| Pedidos/dia | 3+ | 5+ |
| Clientes unicos | 10+ | 20+ |
| Pedidos cancelados | <20% | <10% |
| Ticket promedio | $200+ | $300+ |
| Ganancia envios/dia | $100+ | $250+ |

### Semana 4: Decidir siguiente paso

```
¿Se cumplen las metas?
│
├── SI → Fase 4: Abrir tiendas externas
│         ├── Contactar puestos del mercado
│         ├── Darles link de /tienda/registro
│         └── Aprobar desde /admin
│
└── NO → Ajustar
          ├── ¿Precios muy altos? → Reducir margen
          ├── ¿Pocos productos? → Ampliar catalogo
          ├── ¿Zona chica? → Ampliar cobertura
          └── ¿Nadie sabe? → Mas marketing
```

---

## Checklist pre-lanzamiento

### Catalogo (Fernando)
- [ ] 10+ verduras con precio
- [ ] 8+ frutas con precio
- [ ] 5+ carnes con precio
- [ ] 5+ lacteos con precio
- [ ] 5+ granos/abarrotes con precio
- [ ] Total: 30+ productos listos

### Prueba interna (Todos)
- [ ] Adrian hizo un pedido de prueba como cliente
- [ ] Fernando proceso un pedido completo (Pendiente → Entregado)
- [ ] Hilda entro como repartidora y vio pedidos
- [ ] El mapa funciona correctamente
- [ ] Los precios se ven bien en la app del cliente
- [ ] WhatsApp y Llamar funcionan desde el panel repartidor

### Logistica
- [ ] Fernando tiene transporte para las entregas
- [ ] Llevan cambio para cobrar en efectivo
- [ ] Definir horario de atencion (ej: 8am-3pm)
- [ ] Numero de WhatsApp para que clientes pregunten

### Marketing
- [ ] Mensaje de WhatsApp listo para enviar a conocidos
- [ ] Lista de 10 personas para la primera semana
- [ ] (Opcional) Post para Facebook con foto del mercado

---

## Finanzas — Como cuadrar cuentas

```
EJEMPLO: Un pedido de $350 con envio de $35

Cliente paga en efectivo:           $385
├── Costo productos (pago al puesto): $350
└── Ganancia Mercadito (envio):       $35

AL FINAL DEL DIA:
Total cobrado:                      $1,500 (4 pedidos)
├── Pago a puesto/mercado:          $1,350
└── Ganancia del dia:               $150
```

**Importante:** Mientras sea 1 sola tienda (Mercadito), Fernando compra con el dinero del cliente y se queda con el envio. No hay "pago a tienda" porque el ES la tienda.

Cuando haya tiendas externas, se les paga el subtotal de sus productos.

---

## Problemas comunes y soluciones

| Problema | Solucion |
|----------|----------|
| Producto agotado en el mercado | Llamar al cliente (boton WhatsApp), ofrecer sustitucion |
| Cliente no contesta para confirmar | Esperar 15 min, si no contesta cancelar pedido |
| Pedido muy lejos | Las zonas ya tienen precio de envio diferenciado |
| Dos repartidores toman el mismo pedido | La app muestra quien lo tiene asignado |
| Precio cambio desde que el cliente pidio | Llamar al cliente, explicar y ajustar si acepta |
| Cliente quiere cancelar | Puede hacerlo desde la app si esta en "Pendiente" |

---

## Contacto y accesos

| Recurso | URL |
|---------|-----|
| App principal | (tu dominio)/cliente |
| Panel repartidor | (tu dominio)/repartidor |
| Panel tienda | (tu dominio)/tienda |
| Admin | (tu dominio)/admin |
| Registro de tiendas | (tu dominio)/tienda/registro |
| Repo GitHub | github.com/jadhasfuh/mercadito |

---

*Documento generado el 12 de abril de 2026. Actualizar conforme avance el lanzamiento.*
