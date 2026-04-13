import { query, queryOne } from "@/lib/db";
import { v4 as uuid } from "uuid";

function slug(nombre: string) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// All common fruits and vegetables in Mexico
const FRUTAS = [
  "Manzana", "Platano", "Naranja", "Limon", "Mandarina", "Toronja", "Lima",
  "Mango", "Papaya", "Piña", "Sandia", "Melon", "Guayaba", "Fresa",
  "Uva", "Pera", "Durazno", "Ciruela", "Coco", "Tamarindo",
  "Mamey", "Zapote", "Tuna", "Pitaya", "Granada", "Jicama",
  "Tejocote", "Chirimoya", "Guanabana", "Maracuya",
  "Kiwi", "Zarzamora", "Frambuesa", "Arandano", "Higo",
  "Caña de azucar", "Nanche", "Capulin",
];

const VERDURAS = [
  "Jitomate", "Tomate verde", "Cebolla blanca", "Cebolla morada",
  "Ajo", "Chile serrano", "Chile jalapeño", "Chile habanero", "Chile poblano",
  "Chile de arbol", "Chile ancho", "Chile guajillo", "Chile pasilla",
  "Lechuga", "Espinaca", "Acelga", "Col", "Brocoli", "Coliflor",
  "Zanahoria", "Papa", "Camote", "Chayote", "Calabaza",
  "Calabacita", "Pepino", "Ejote", "Chicharo", "Elote",
  "Aguacate", "Nopal", "Cilantro", "Perejil", "Epazote",
  "Hierba buena", "Rabano", "Betabel", "Apio",
  "Champiñon", "Pimiento morron", "Quelite",
];

// Products with units other than kg
const UNIDADES_ESPECIALES: Record<string, string> = {
  "Elote": "pieza",
  "Piña": "pieza",
  "Sandia": "pieza",
  "Melon": "pieza",
  "Coco": "pieza",
  "Lechuga": "pieza",
  "Col": "pieza",
  "Brocoli": "pieza",
  "Coliflor": "pieza",
  "Cilantro": "manojo",
  "Perejil": "manojo",
  "Epazote": "manojo",
  "Hierba buena": "manojo",
  "Quelite": "manojo",
  "Rabano": "manojo",
  "Caña de azucar": "pieza",
};

// Sample prices for Tienda TEST (a subset of products)
const PRECIOS_TEST: Record<string, number> = {
  "Manzana": 45, "Platano": 18, "Naranja": 25, "Limon": 35, "Mango": 30,
  "Papaya": 28, "Fresa": 65, "Sandia": 40, "Guayaba": 30, "Uva": 70,
  "Jitomate": 28, "Cebolla blanca": 22, "Ajo": 90, "Chile serrano": 35,
  "Zanahoria": 18, "Papa": 25, "Aguacate": 60, "Calabacita": 20,
  "Pepino": 18, "Lechuga": 15, "Brocoli": 25, "Elote": 10,
  "Cilantro": 8, "Nopal": 15, "Champiñon": 55, "Chile jalapeño": 30,
  "Tomate verde": 22, "Cebolla morada": 28, "Espinaca": 22, "Chayote": 15,
};

// Prices for Mercadito (Fernando) — a smaller overlap so clients see options
const PRECIOS_MERCADITO: Record<string, number> = {
  "Manzana": 42, "Platano": 16, "Naranja": 22, "Limon": 38, "Mango": 28,
  "Fresa": 60, "Guayaba": 28, "Uva": 65,
  "Jitomate": 25, "Cebolla blanca": 20, "Chile serrano": 32,
  "Papa": 22, "Aguacate": 55, "Zanahoria": 15,
  "Nopal": 12, "Tomate verde": 20, "Pepino": 15,
};

export async function POST() {
  try {
    // Check if products already seeded
    const existing = await queryOne<{ n: string }>("SELECT COUNT(*) as n FROM productos");
    if (existing && parseInt(existing.n) > 5) {
      return Response.json({ ok: false, error: "Ya hay productos cargados. Borra manualmente si quieres re-seed." }, { status: 400 });
    }

    // Create Tienda TEST store
    const testStoreExists = await queryOne("SELECT id FROM puestos WHERE id = $1", ["tienda-test"]);
    if (!testStoreExists) {
      await query(
        "INSERT INTO puestos (id, nombre, descripcion, ubicacion, activo, aprobado) VALUES ($1, $2, $3, $4, true, true)",
        ["tienda-test", "Tienda TEST", "Tienda de prueba para testing", "Sahuayo Centro"]
      );
      // Create a user for the test store
      await query(
        "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        ["tienda-test-user", "Tienda Test", "0000000000", "1234", "tienda", "tienda-test"]
      );
    }

    // Ensure mercadito store exists
    const mercaditoExists = await queryOne("SELECT id FROM puestos WHERE id = $1", ["mercadito"]);
    if (!mercaditoExists) {
      await query(
        "INSERT INTO puestos (id, nombre, descripcion, ubicacion, activo, aprobado) VALUES ($1, $2, $3, $4, true, true)",
        ["mercadito", "Mercadito", "Tienda principal — todos los productos", "Principal"]
      );
    }

    const productsCreated: string[] = [];
    const pricesCreated: string[] = [];

    // Insert all fruits
    for (const nombre of FRUTAS) {
      const id = `${slug(nombre)}-${uuid().slice(0, 4)}`;
      const unidad = UNIDADES_ESPECIALES[nombre] || "kg";
      await query(
        "INSERT INTO productos (id, nombre, categoria_id, unidad) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [id, nombre, "frutas", unidad]
      );
      productsCreated.push(nombre);

      // Set price for Tienda TEST if in list
      if (PRECIOS_TEST[nombre]) {
        await query(
          "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES ($1, $2, $3, $4, CURRENT_DATE, true)",
          [`precio-test-${slug(nombre)}-${uuid().slice(0, 4)}`, id, "tienda-test", PRECIOS_TEST[nombre]]
        );
        pricesCreated.push(`${nombre} (TEST: $${PRECIOS_TEST[nombre]})`);
      }

      // Set price for Mercadito if in list
      if (PRECIOS_MERCADITO[nombre]) {
        await query(
          "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES ($1, $2, $3, $4, CURRENT_DATE, true)",
          [`precio-merc-${slug(nombre)}-${uuid().slice(0, 4)}`, id, "mercadito", PRECIOS_MERCADITO[nombre]]
        );
        pricesCreated.push(`${nombre} (Mercadito: $${PRECIOS_MERCADITO[nombre]})`);
      }
    }

    // Insert all vegetables
    for (const nombre of VERDURAS) {
      const id = `${slug(nombre)}-${uuid().slice(0, 4)}`;
      const unidad = UNIDADES_ESPECIALES[nombre] || "kg";
      await query(
        "INSERT INTO productos (id, nombre, categoria_id, unidad) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [id, nombre, "verduras", unidad]
      );
      productsCreated.push(nombre);

      if (PRECIOS_TEST[nombre]) {
        await query(
          "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES ($1, $2, $3, $4, CURRENT_DATE, true)",
          [`precio-test-${slug(nombre)}-${uuid().slice(0, 4)}`, id, "tienda-test", PRECIOS_TEST[nombre]]
        );
        pricesCreated.push(`${nombre} (TEST: $${PRECIOS_TEST[nombre]})`);
      }

      if (PRECIOS_MERCADITO[nombre]) {
        await query(
          "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, activo) VALUES ($1, $2, $3, $4, CURRENT_DATE, true)",
          [`precio-merc-${slug(nombre)}-${uuid().slice(0, 4)}`, id, "mercadito", PRECIOS_MERCADITO[nombre]]
        );
        pricesCreated.push(`${nombre} (Mercadito: $${PRECIOS_MERCADITO[nombre]})`);
      }
    }

    return Response.json({
      ok: true,
      productos_creados: productsCreated.length,
      precios_creados: pricesCreated.length,
      tienda_test: "Tienda TEST (tel: 0000000000, pin: 1234)",
      detalle_precios: pricesCreated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
