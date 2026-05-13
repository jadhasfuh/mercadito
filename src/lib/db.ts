import { Pool, type QueryResultRow } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://localhost:5432/mercadito",
});

let initialized = false;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Ejecuta el callback dentro de una transacción (BEGIN/COMMIT). Si el callback
 * arroja, se hace ROLLBACK y se re-lanza. Usar para operaciones multi-tabla que
 * deben ser atómicas — ej. crear pedido + insertar items.
 */
export async function withTransaction<T>(
  fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>
): Promise<T> {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = async <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<R[]> => {
      const r = await client.query<R>(text, params);
      return r.rows;
    };
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categorias (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      icono TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS puestos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      ubicacion TEXT,
      activo BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      categoria_id TEXT NOT NULL REFERENCES categorias(id),
      unidad TEXT NOT NULL DEFAULT 'kg',
      imagen TEXT
    );

    CREATE TABLE IF NOT EXISTS precios (
      id TEXT PRIMARY KEY,
      producto_id TEXT NOT NULL REFERENCES productos(id),
      puesto_id TEXT NOT NULL REFERENCES puestos(id),
      precio NUMERIC(10,2) NOT NULL,
      fecha DATE NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS zonas_entrega (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      costo_envio NUMERIC(10,2) NOT NULL,
      tiempo_estimado TEXT,
      activa BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT REFERENCES usuarios(id),
      cliente_nombre TEXT NOT NULL,
      cliente_telefono TEXT NOT NULL,
      zona_id TEXT NOT NULL DEFAULT 'mapa',
      direccion_entrega TEXT NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      costo_envio NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      pin TEXT,
      rol TEXT NOT NULL DEFAULT 'cliente',
      puesto_id TEXT REFERENCES puestos(id),
      activo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pedido_items (
      id TEXT PRIMARY KEY,
      pedido_id TEXT NOT NULL REFERENCES pedidos(id),
      producto_id TEXT NOT NULL REFERENCES productos(id),
      puesto_id TEXT NOT NULL REFERENCES puestos(id),
      cantidad NUMERIC(10,2) NOT NULL,
      precio_unitario NUMERIC(10,2) NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL
    );
  `);

  // Migrations: add columns that may not exist yet
  const migrations = [
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id TEXT REFERENCES usuarios(id)",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_id TEXT REFERENCES usuarios(id)",
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS aprobado BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS telefono_contacto TEXT",
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION",
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION",
    // Allow same phone for different roles
    "ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_telefono_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS usuarios_telefono_rol_idx ON usuarios (telefono, rol)",
    // Cancellation reason and edit tracking
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS editado_por TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS editado_at TIMESTAMPTZ",
    // Store addresses and coordinates for mercadito and tienda-test
    `UPDATE puestos SET lat = 20.0463867, lng = -102.7229156, ubicacion = 'C. José María Morelos, Centro Uno, 59000 Sahuayo de Morelos, Mich.' WHERE id = 'mercadito' AND (ubicacion IS NULL OR ubicacion = 'Principal')`,
    `UPDATE puestos SET lat = 20.0436240, lng = -102.7187414, ubicacion = 'Plaza Feria Sahuayo, Camino Real, Sahuayo de Morelos, Mich.' WHERE id = 'tienda-test' AND (ubicacion IS NULL OR ubicacion = 'Sahuayo Centro')`,
    // New categories
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('restaurante', 'Restaurante / Comida', '🍽️', 7) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('antojitos', 'Antojitos y Comida Rápida', '🌮', 8) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('panaderia', 'Panadería y Repostería', '🍞', 9) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('bebidas', 'Bebidas', '🥤', 10) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('farmacia', 'Farmacia', '💊', 11) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('limpieza', 'Limpieza y Hogar', '🧹', 12) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('mascotas', 'Mascotas', '🐾', 13) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('otro', 'Otro', '📦', 99) ON CONFLICT DO NOTHING",
    // Update existing categories names
    "UPDATE categorias SET nombre = 'Carnes y Mariscos', orden = 3 WHERE id = 'carnes'",
    "UPDATE categorias SET orden = 4 WHERE id = 'lacteos'",
    "UPDATE categorias SET orden = 5 WHERE id = 'abarrotes'",
    "UPDATE categorias SET orden = 6 WHERE id = 'granos'",
    // Product description column
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion TEXT",
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS seccion TEXT",
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS subseccion TEXT",
    // Product availability toggle + optional schedule
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true",
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS horario_desde TEXT",
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS horario_hasta TEXT",
    // Store logo
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS logo TEXT",
    // Set default logo for mercadito store
    "UPDATE puestos SET logo = '/logo.png' WHERE id = 'mercadito' AND logo IS NULL",
    // New categories: cremeria, botanero, cafeteria, comidas
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('cremeria', 'Cremería', '🧈', 4) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('botanero', 'Centro Botanero', '🍻', 8) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('cafeteria', 'Cafetería', '☕', 9) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('comidas', 'Comidas Preparadas', '🍲', 10) ON CONFLICT DO NOTHING",
    // Reorder existing categories to accommodate new ones
    "UPDATE categorias SET orden = 5 WHERE id = 'abarrotes'",
    "UPDATE categorias SET orden = 6 WHERE id = 'granos'",
    "UPDATE categorias SET orden = 7 WHERE id = 'restaurante'",
    "UPDATE categorias SET orden = 11 WHERE id = 'antojitos'",
    "UPDATE categorias SET orden = 12 WHERE id = 'panaderia'",
    "UPDATE categorias SET orden = 13 WHERE id = 'bebidas'",
    "UPDATE categorias SET orden = 14 WHERE id = 'farmacia'",
    "UPDATE categorias SET orden = 15 WHERE id = 'limpieza'",
    "UPDATE categorias SET orden = 16 WHERE id = 'mascotas'",
    // Nuevas categorías: ropa y calzado
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('ropa', 'Ropa', '👕', 17) ON CONFLICT DO NOTHING",
    "INSERT INTO categorias (id, nombre, icono, orden) VALUES ('calzado', 'Calzado', '👟', 18) ON CONFLICT DO NOTHING",
    // Multi-tag store categories (puesto_categorias junction table)
    `CREATE TABLE IF NOT EXISTS puesto_categorias (
      puesto_id TEXT NOT NULL REFERENCES puestos(id),
      categoria_id TEXT NOT NULL REFERENCES categorias(id),
      PRIMARY KEY (puesto_id, categoria_id)
    )`,
    // puesto_categorias: ya no se usa, categorias se derivan de productos
    // Commission per item tracking
    "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS comision NUMERIC(10,2) DEFAULT 0",
    // Payment method and card surcharge
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT 'efectivo'",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recargo_tarjeta NUMERIC(10,2) DEFAULT 0",
    // Messages table (admin -> tienda)
    `CREATE TABLE IF NOT EXISTS mensajes (
      id TEXT PRIMARY KEY,
      de_usuario_id TEXT REFERENCES usuarios(id),
      para_puesto_id TEXT REFERENCES puestos(id),
      mensaje TEXT NOT NULL,
      leido BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Announcements table
    `CREATE TABLE IF NOT EXISTS anuncios (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'general',
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Performance indexes
    "CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado)",
    "CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_tel ON pedidos(cliente_telefono)",
    "CREATE INDEX IF NOT EXISTS idx_pedidos_repartidor ON pedidos(repartidor_id)",
    "CREATE INDEX IF NOT EXISTS idx_pedidos_created ON pedidos(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id)",
    "CREATE INDEX IF NOT EXISTS idx_precios_producto ON precios(producto_id, activo)",
    "CREATE INDEX IF NOT EXISTS idx_precios_puesto ON precios(puesto_id, activo)",
    "CREATE INDEX IF NOT EXISTS idx_usuarios_tel_rol ON usuarios(telefono, rol)",
    "CREATE INDEX IF NOT EXISTS idx_sesiones_expires ON sesiones(expires_at)",
    // Store-level named schedules (e.g., "Desayuno 07:00-11:00")
    `CREATE TABLE IF NOT EXISTS puesto_horarios (
      id TEXT PRIMARY KEY,
      puesto_id TEXT NOT NULL REFERENCES puestos(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      desde TEXT NOT NULL,
      hasta TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Many-to-many: a product can belong to multiple schedules
    `CREATE TABLE IF NOT EXISTS producto_horarios (
      producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      horario_id TEXT NOT NULL REFERENCES puesto_horarios(id) ON DELETE CASCADE,
      PRIMARY KEY (producto_id, horario_id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_puesto_horarios_puesto ON puesto_horarios(puesto_id)",
    "CREATE INDEX IF NOT EXISTS idx_producto_horarios_producto ON producto_horarios(producto_id)",
    // Default presets for mercadito puesto (idempotent via fixed IDs)
    `INSERT INTO puesto_horarios (id, puesto_id, nombre, desde, hasta) VALUES
      ('h-mercadito-desayuno', 'mercadito', 'Desayuno', '07:00', '11:00'),
      ('h-mercadito-comida', 'mercadito', 'Comida', '11:00', '17:00'),
      ('h-mercadito-tarde', 'mercadito', 'Tarde', '17:00', '22:00')
    ON CONFLICT (id) DO NOTHING`,
    // Migrate any existing per-product horarios into store-level presets and link them.
    // Buckets: Desayuno (hasta <= 11:30), Comida (desde >= 11:00 y hasta <= 17:00), Tarde (resto).
    `INSERT INTO puesto_horarios (id, puesto_id, nombre, desde, hasta)
     SELECT DISTINCT
       'h-' || pr.puesto_id || '-' || REPLACE(p.horario_desde, ':', '') || '-' || REPLACE(p.horario_hasta, ':', ''),
       pr.puesto_id,
       CASE
         WHEN p.horario_hasta <= '11:30' THEN 'Desayuno'
         WHEN p.horario_desde >= '11:00' AND p.horario_hasta <= '17:00' THEN 'Comida'
         WHEN p.horario_desde >= '17:00' THEN 'Tarde'
         ELSE p.horario_desde || '-' || p.horario_hasta
       END,
       p.horario_desde,
       p.horario_hasta
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true
     WHERE p.horario_desde IS NOT NULL AND p.horario_hasta IS NOT NULL
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO producto_horarios (producto_id, horario_id)
     SELECT DISTINCT
       p.id,
       'h-' || pr.puesto_id || '-' || REPLACE(p.horario_desde, ':', '') || '-' || REPLACE(p.horario_hasta, ':', '')
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true
     WHERE p.horario_desde IS NOT NULL AND p.horario_hasta IS NOT NULL
     ON CONFLICT DO NOTHING`,
    // Old per-product schedule columns are no longer used
    "ALTER TABLE productos DROP COLUMN IF EXISTS horario_desde",
    "ALTER TABLE productos DROP COLUMN IF EXISTS horario_hasta",
    // Store opening hours per weekday (0=domingo ... 6=sabado). Sin filas = 24/7.
    // abre/cierra NULL en una fila = cerrado ese dia.
    // descanso_desde/hasta: ventana de siesta dentro del horario, opcional.
    `CREATE TABLE IF NOT EXISTS puesto_horario_atencion (
      puesto_id TEXT NOT NULL REFERENCES puestos(id) ON DELETE CASCADE,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      abre TEXT,
      cierra TEXT,
      PRIMARY KEY (puesto_id, dia_semana)
    )`,
    "ALTER TABLE puesto_horario_atencion ADD COLUMN IF NOT EXISTS descanso_desde TEXT",
    "ALTER TABLE puesto_horario_atencion ADD COLUMN IF NOT EXISTS descanso_hasta TEXT",
    // Días de la semana en que un producto está disponible (0=domingo ... 6=sábado).
    // Sin filas = disponible todos los días. Uso típico: "tacos de sesos solo
    // martes y jueves" → dos filas (2, 4).
    `CREATE TABLE IF NOT EXISTS producto_dias (
      producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      PRIMARY KEY (producto_id, dia_semana)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_producto_dias_producto ON producto_dias(producto_id)",
    // Expo push token per user (for mobile push notifications)
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS push_token TEXT",
    // Precio de mayoreo: a partir de N unidades (mayoreo_desde), precio baja a precio_mayoreo
    "ALTER TABLE precios ADD COLUMN IF NOT EXISTS precio_mayoreo NUMERIC(10,2)",
    "ALTER TABLE precios ADD COLUMN IF NOT EXISTS mayoreo_desde NUMERIC(10,2)",
    // Pago por transferencia: cliente sube comprobante, admin valida antes de que
    // el pedido esté disponible para repartidores.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante_pago TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_validado_at TIMESTAMPTZ",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_validado_por TEXT",
    // Rating (1-5) + comentario que el admin asigna al desempeño del repartidor
    // en cada pedido. No visible al cliente.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_rating SMALLINT CHECK (repartidor_rating BETWEEN 1 AND 5)",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_review TEXT",
    // Pedido agendado: cliente reserva entrega para más tarde / mañana.
    // NULL = pedido inmediato.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ",
    "CREATE INDEX IF NOT EXISTS idx_pedidos_agendado ON pedidos(agendado_para)",
    // Lead time: tiendas que solo aceptan pedidos con anticipación. 0 = sin
    // restricción (entrega inmediata si está abierta). 1 = día siguiente.
    // Se mide en días calendario MX (no horas) porque "encárgalo hoy 9 PM,
    // entrega mañana" debe funcionar — un lead en horas estrictas saltaría
    // un día más.
    "ALTER TABLE puestos ADD COLUMN IF NOT EXISTS lead_time_dias INTEGER NOT NULL DEFAULT 0",
    // Lead time por producto. NULL = hereda el del puesto. Permite que una
    // tienda con la mayoría de productos inmediatos tenga uno o varios "sobre
    // pedido" — ej. churros normales inmediatos, churros decorados a 2 días.
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS lead_time_dias INTEGER",
    // Envíos (paquetes entre ciudades). Reusan la tabla pedidos para heredar
    // toda la infra (repartidor, tracking, ratings, validación de pago).
    // tipo='mercado' (default) son los pedidos del catálogo;
    // tipo='envio' son envíos de paquetes — sin items, con direccion_recogida,
    // peso, descripción del contenido. Restricciones (max 10kg, no sustancias
    // ilegales) se validan en la API.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'mercado'",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_recogida TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recogida_lat DOUBLE PRECISION",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recogida_lng DOUBLE PRECISION",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recogida_nombre TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recogida_telefono TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(5,2)",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS descripcion_contenido TEXT",
    // Solicitud de repartidor por tienda (B2B). Cuando un restaurante
    // tiene su propio cliente y solo quiere usar nuestro repartidor:
    // - solicitado_por_tienda_id apunta al puesto que origino el pedido.
    //   tipo sigue siendo 'envio' para reusar toda la infra de tracking.
    // - envio_pagado_por: 'cliente' (default, repartidor cobra al cliente)
    //   o 'tienda' (la tienda absorbe el envio y se le factura semanal).
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS solicitado_por_tienda_id TEXT REFERENCES puestos(id)",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_pagado_por TEXT NOT NULL DEFAULT 'cliente'",
    "CREATE INDEX IF NOT EXISTS idx_pedidos_solicitado_por_tienda ON pedidos(solicitado_por_tienda_id) WHERE solicitado_por_tienda_id IS NOT NULL",
    // Foto de entrega: repartidor captura una foto al marcar entregado.
    // Sirve como prueba ante disputas y refuerza confianza del cliente.
    // Es base64 (data URL); para tamaños grandes mover a S3/storage.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS foto_entrega TEXT",
    // Programa de referidos: cada cliente nuevo genera un codigo_referido
    // (ABC-XYZ12). Cuando otro se registra usándolo, queda atado al
    // referente; al primer pedido entregado del nuevo, ambos ganan $20
    // de saldo aplicable solo a envío + servicio Mercadito. La tienda
    // siempre cobra íntegro (POST /api/pedidos acepta usar_credito,
    // capeado a totalComision + costoEnvio).
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_referido TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_codigo_referido ON usuarios(codigo_referido) WHERE codigo_referido IS NOT NULL",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS referido_por_id TEXT REFERENCES usuarios(id)",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS saldo_credito NUMERIC(10,2) NOT NULL DEFAULT 0",
    // Marca el pedido del que se derivó el crédito de referido — evita
    // duplicar el bono si el cliente repite estado entregado por error.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS credito_referido_aplicado BOOLEAN NOT NULL DEFAULT false",
    // Timestamp en que el repartidor marcó el pedido como entregado.
    // Se llena en el UPDATE cuando el estado pasa a 'entregado' (solo si
    // estaba NULL — evita reescribir si el repartidor lo marca dos veces).
    // Lo usa el cron de "califica tu pedido" para mandar push 1h después.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMPTZ",
    // Backfill para pedidos ya entregados antes de tener la columna:
    // aproximamos con created_at + 1h para que el cron no los considere
    // recientes. Solo actualiza filas donde sigue NULL.
    "UPDATE pedidos SET entregado_at = created_at + INTERVAL '1 hour' WHERE estado = 'entregado' AND entregado_at IS NULL",
    // Bandera idempotente para el cron: una vez enviado el push de "califica
    // al repartidor" no lo reenvía. Para pedidos pre-existentes la marcamos
    // true (no queremos spamear con calificaciones de pedidos viejos).
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS push_calificar_enviado BOOLEAN NOT NULL DEFAULT false",
    "UPDATE pedidos SET push_calificar_enviado = true WHERE estado = 'entregado' AND push_calificar_enviado = false AND entregado_at < NOW() - INTERVAL '6 hours'",
    // Cuánto saldo aplicó el cliente como descuento en este pedido.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS credito_usado NUMERIC(10,2) NOT NULL DEFAULT 0",
    // Anuncios con imagen: el admin sube un banner promocional (ej. promo
    // de envío gratis) sin necesidad de redeploy. Si imagen es null, se
    // muestra como tarjeta de texto.
    "ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS imagen TEXT",
    "ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS link TEXT",
    // Migrar el viejo lead_time_horas si existe: 24h o más → 1 día, 48h →
    // 2 días, etc. Después borramos la columna vieja.
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='puestos' AND column_name='lead_time_horas') THEN
         UPDATE puestos SET lead_time_dias = GREATEST(lead_time_dias, CEIL(lead_time_horas::numeric / 24)::int)
           WHERE lead_time_horas > 0 AND lead_time_dias = 0;
         ALTER TABLE puestos DROP COLUMN lead_time_horas;
       END IF;
     END $$`,
    // Última ubicación reportada por el repartidor — se actualiza desde el
    // cliente del repartidor con watchPosition. El cliente del cliente
    // pollea para ver dónde anda su pedido en camino.
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacion_lat DOUBLE PRECISION",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacion_lng DOUBLE PRECISION",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacion_at TIMESTAMPTZ",

    // ==============  VARIANTES (Shopify-style, ropa/calzado)  ==============
    // Opciones (ej "Color", "Talla") y sus valores (ej "Rojo", "26").
    // Una variante es una combinación concreta (Rojo + 26) con precio override
    // opcional. Si precio_override es NULL, se usa el precio base de la tabla
    // precios.
    `CREATE TABLE IF NOT EXISTS producto_opciones (
      id TEXT PRIMARY KEY,
      producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      orden INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS producto_opcion_valores (
      id TEXT PRIMARY KEY,
      opcion_id TEXT NOT NULL REFERENCES producto_opciones(id) ON DELETE CASCADE,
      valor TEXT NOT NULL,
      orden INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS producto_variantes (
      id TEXT PRIMARY KEY,
      producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      precio_override NUMERIC(10,2),
      precio_mayoreo_override NUMERIC(10,2),
      mayoreo_desde_override NUMERIC(10,2),
      activo BOOLEAN DEFAULT true,
      orden INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS variante_valores (
      variante_id TEXT NOT NULL REFERENCES producto_variantes(id) ON DELETE CASCADE,
      valor_id TEXT NOT NULL REFERENCES producto_opcion_valores(id) ON DELETE CASCADE,
      PRIMARY KEY (variante_id, valor_id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_producto_opciones_prod ON producto_opciones(producto_id)",
    "CREATE INDEX IF NOT EXISTS idx_producto_variantes_prod ON producto_variantes(producto_id)",

    // ==============  MODIFICADORES (Uber Eats-style, comida)  ==============
    // Un modificador es un grupo (ej "Salsa"), y tiene opciones (ej "Verde",
    // "Roja", "Picante") cada una con un precio_extra que se suma al producto.
    // obligatorio = el cliente debe elegir al menos 1. multiple = checkbox vs
    // radio. maximo = tope de opciones elegibles si es multiple.
    `CREATE TABLE IF NOT EXISTS producto_modificadores (
      id TEXT PRIMARY KEY,
      producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      obligatorio BOOLEAN DEFAULT false,
      multiple BOOLEAN DEFAULT false,
      maximo INT,
      orden INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS modificador_opciones (
      id TEXT PRIMARY KEY,
      modificador_id TEXT NOT NULL REFERENCES producto_modificadores(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      precio_extra NUMERIC(10,2) DEFAULT 0,
      orden INT DEFAULT 0
    )`,
    "CREATE INDEX IF NOT EXISTS idx_producto_modificadores_prod ON producto_modificadores(producto_id)",

    // pedido_items guarda la selección congelada al momento de la compra.
    // variante_nombre: cache "Rojo / 26" para no tener que hacer JOIN ni
    // depender de la variante (que podría borrarse).
    // modificadores: JSON con [{nombre, valor, extra}, ...] — también congelado.
    "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS variante_id TEXT",
    "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS variante_nombre TEXT",
    "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS modificadores JSONB",
    // precio_extra por valor (ej "Color Rojo +$10"). La variante suma los
    // extras de sus valores para calcular el precio efectivo.
    "ALTER TABLE producto_opcion_valores ADD COLUMN IF NOT EXISTS precio_extra NUMERIC(10,2) DEFAULT 0",
    // minimo de opciones elegibles en un modificador multiple. Si minimo=maximo
    // la UI lo presenta como "Elige exactamente N". Ej: pizza de 3 ingredientes
    // obliga al cliente a elegir 3 ingredientes.
    "ALTER TABLE producto_modificadores ADD COLUMN IF NOT EXISTS minimo INT",
    // Items manuales (sustitución por similar): el repartidor agrega un producto
    // que no existe en catálogo cuando un producto comprado no estaba disponible.
    // producto_id NULL + producto_nombre con el texto libre que tecleó.
    "ALTER TABLE pedido_items ALTER COLUMN producto_id DROP NOT NULL",
    "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS producto_nombre TEXT",
    // Mandados: cliente pide al repartidor que vaya a un origen, recoja/compre
    // algo, y se lo lleve a destino. Opcionalmente regresa al origen (ida y
    // vuelta — ej. devolver llaves, regresar firma). monto_mandado es lo que
    // el repartidor adelanta y cobra al cliente al entregar (ej. medicina,
    // comida). Se reusa tipo='envio' con estos flags.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ida_vuelta BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS monto_mandado NUMERIC(10,2)",
    // Mandado en destino: a veces el cliente también necesita instrucciones
    // o un cobro al entregar (ej. "pregunta por Juan y entrégale", o "le
    // cobras $X al recibir"). Distinto del monto_mandado que es lo que el
    // repartidor adelanta en el origen.
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS destino_descripcion TEXT",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS destino_monto NUMERIC(10,2)",
    // Precio variable por peso: producto se vende por pieza pero el precio
    // final depende del peso real (sandía, melón, repollo, brócoli, etc.).
    // Cliente ve un chip "⚖️ Precio aprox · varía por peso" en la card y
    // Fernando ajusta el precio_unitario real al pesar (vía PATCH items).
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_variable_peso BOOLEAN NOT NULL DEFAULT false",
    // Productos vendidos por peso/medida con cantidad libre. permite_fraccion:
    // el cliente puede pedir 0.25 / 0.5 / 1.5 kg (no solo enteros). Útil para
    // fruterías/verdulerías que respetan precio/kg proporcional. permite_por_dinero:
    // el cliente puede teclear un monto en pesos ("dame $20 de tortilla") y la
    // app calcula la cantidad. Ambos están bloqueados cuando el producto tiene
    // variantes (no tiene sentido pedir 0.5 botellas de rompope).
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS permite_fraccion BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE productos ADD COLUMN IF NOT EXISTS permite_por_dinero BOOLEAN NOT NULL DEFAULT false",
    // Backfill códigos de referido: cuentas creadas antes del 1.0.x del
    // programa de referidos quedaron con codigo_referido NULL y no podían
    // invitar amigos. Generamos uno único en formato MERCA-XXXXX para cada
    // cliente que aún no tenga. Idempotente — solo afecta filas NULL.
    `DO $$
     DECLARE
       u RECORD;
       nuevo TEXT;
       alfa TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
     BEGIN
       FOR u IN SELECT id FROM usuarios WHERE rol = 'cliente' AND codigo_referido IS NULL LOOP
         LOOP
           nuevo := 'MERCA-' ||
             substr(alfa, 1 + floor(random() * 32)::int, 1) ||
             substr(alfa, 1 + floor(random() * 32)::int, 1) ||
             substr(alfa, 1 + floor(random() * 32)::int, 1) ||
             substr(alfa, 1 + floor(random() * 32)::int, 1) ||
             substr(alfa, 1 + floor(random() * 32)::int, 1);
           EXIT WHEN NOT EXISTS (SELECT 1 FROM usuarios WHERE codigo_referido = nuevo);
         END LOOP;
         UPDATE usuarios SET codigo_referido = nuevo WHERE id = u.id;
       END LOOP;
     END $$`,
    // Ingresos manuales: ventas que el repartidor toma fuera de la app
    // (pedidos por WhatsApp directo, mandados con cobro mental). Solo se
    // registra la ganancia que le toca a Mercadito (envío + servicio), no
    // el ticket completo del cliente. tipo discrimina si fue compra en
    // una tienda del catálogo (puesto_id) o un mandado de cliente directo
    // (cliente_nombre/telefono).
    `CREATE TABLE IF NOT EXISTS ingresos_manuales (
      id TEXT PRIMARY KEY,
      repartidor_id TEXT NOT NULL REFERENCES usuarios(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('tienda', 'mandado')),
      puesto_id TEXT REFERENCES puestos(id),
      cliente_nombre TEXT,
      cliente_telefono TEXT,
      monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
      metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
      detalle TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_ingresos_manuales_repartidor ON ingresos_manuales(repartidor_id)",
    "CREATE INDEX IF NOT EXISTS idx_ingresos_manuales_created ON ingresos_manuales(created_at DESC)",
    // Cuando una tienda B2B (envio_pagado_por='tienda') liquida su cuenta
    // semanal en efectivo/transferencia fuera de la app, marcamos los
    // pedidos cubiertos para que dejen de aparecer en /admin → cuentas
    // pendientes. NULL = aún debe; timestamp = ya pagó (cuándo).
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tienda_envio_pagado_at TIMESTAMPTZ",
    // Subquery de rating por puesto en /api/productos hace seq scan en pedido_items
    // por puesto_id (no había índice). Reduce el cálculo de rating de ms × N
    // productos a una sola pasada con índice.
    "CREATE INDEX IF NOT EXISTS idx_pedido_items_puesto_id ON pedido_items(puesto_id)",
  ];
  // Corremos cada migración capturando el error — así una falla no tumba el
  // boot, pero la registramos a stderr para tener visibilidad real (antes las
  // silenciábamos con .catch(() => {}) y podíamos quedar con schema incompleto
  // sin saberlo).
  for (const m of migrations) {
    try {
      await pool.query(m);
    } catch (e) {
      const head = m.replace(/\s+/g, " ").slice(0, 120);
      console.error(`[db] migration failed: ${head}…`, (e as Error).message);
    }
  }

  // Seed if empty
  const { rows } = await pool.query("SELECT COUNT(*) as n FROM categorias");
  if (parseInt(rows[0].n) === 0) {
    await seedData();
  }
}

async function seedData() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Categories
    const categorias = [
      ["frutas", "Frutas", "🍎", 1],
      ["verduras", "Verduras", "🥬", 2],
      ["carnes", "Carnes y Mariscos", "🥩", 3],
      ["lacteos", "Lácteos", "🧀", 4],
      ["cremeria", "Cremería", "🧈", 5],
      ["abarrotes", "Abarrotes", "🛒", 6],
      ["granos", "Granos y Semillas", "🌾", 7],
      ["restaurante", "Restaurante / Comida", "🍽️", 8],
      ["botanero", "Centro Botanero", "🍻", 9],
      ["cafeteria", "Cafetería", "☕", 10],
      ["comidas", "Comidas Preparadas", "🍲", 11],
      ["antojitos", "Antojitos y Comida Rápida", "🌮", 12],
      ["panaderia", "Panadería y Repostería", "🍞", 13],
      ["bebidas", "Bebidas", "🥤", 14],
      ["farmacia", "Farmacia", "💊", 15],
      ["limpieza", "Limpieza y Hogar", "🧹", 16],
      ["mascotas", "Mascotas", "🐾", 17],
      ["otro", "Otro", "📦", 99],
    ];
    for (const [id, nombre, icono, orden] of categorias) {
      await client.query(
        "INSERT INTO categorias (id, nombre, icono, orden) VALUES ($1, $2, $3, $4)",
        [id, nombre, icono, orden]
      );
    }

    // Puestos — 1 tienda principal para periodo de prueba
    const puestos = [
      ["mercadito", "Mercadito", "Tienda principal — todos los productos", "Principal"],
    ];
    for (const [id, nombre, desc, ubic] of puestos) {
      await client.query(
        "INSERT INTO puestos (id, nombre, descripcion, ubicacion) VALUES ($1, $2, $3, $4)",
        [id, nombre, desc, ubic]
      );
    }

    // Products and prices left empty — to be filled by store owners via /tienda

    // Delivery zones
    const zonas = [
      ["sahuayo-centro", "Sahuayo - Centro", 25, "30-45 min"],
      ["sahuayo-colonias", "Sahuayo - Colonias", 35, "45-60 min"],
      ["jiquilpan", "Jiquilpan", 50, "60-90 min"],
      ["venustiano", "Venustiano Carranza", 55, "60-90 min"],
    ];
    for (const [id, nombre, costo, tiempo] of zonas) {
      await client.query(
        "INSERT INTO zonas_entrega (id, nombre, costo_envio, tiempo_estimado) VALUES ($1, $2, $3, $4)",
        [id, nombre, costo, tiempo]
      );
    }

    // Fernando — repartidor + maneja tienda Mercadito
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["fernando-1", "Fernando", "3531539602", "2006", "repartidor", "mercadito"]
    );

    // Hilda — repartidora
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol) VALUES ($1, $2, $3, $4, $5)",
      ["hilda-1", "Hilda", "3531343056", "1974", "repartidor"]
    );

    // Admin
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol) VALUES ($1, $2, $3, $4, $5)",
      ["admin-1", "Adrian", "3531522293", "1999", "admin"]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
