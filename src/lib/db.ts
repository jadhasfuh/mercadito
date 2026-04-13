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
      telefono TEXT NOT NULL UNIQUE,
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
  ];
  for (const m of migrations) {
    await pool.query(m).catch(() => {});
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
      ["lacteos", "Lácteos", "🧀", 3],
      ["granos", "Granos y Semillas", "🌾", 4],
      ["comidas", "Comidas Preparadas", "🍲", 5],
      ["carnes", "Carnes", "🥩", 6],
      ["abarrotes", "Abarrotes", "🛒", 7],
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

    // Repartidor user
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol) VALUES ($1, $2, $3, $4, $5)",
      ["repartidor-1", "Repartidor", "0000000000", "1234", "repartidor"]
    );

    // Tienda user — single store for testing period
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, 'tienda', $5)",
      ["tienda-mercadito", "Mercadito", "3530000001", "1234", "mercadito"]
    );

    // Admin user
    await client.query(
      "INSERT INTO usuarios (id, nombre, telefono, pin, rol) VALUES ($1, $2, $3, $4, $5)",
      ["admin-1", "Adrian", "3530000000", "1234", "admin"]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
