import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DELIVERY_ACTIVO } from "@/lib/flags";
import { query } from "@/lib/db";

const BASE_URL = "https://mercadito.cx";

interface Oferta {
  puesto_id: string;
  puesto_nombre: string;
  precio: number;
}
interface ProductoData {
  producto: { id: string; nombre: string; descripcion: string | null; unidad: string | null; tiene_foto: boolean };
  ofertas: Oferta[];
}

// Cacheado por request: generateMetadata y la página comparten la consulta.
const getProducto = cache(async (id: string): Promise<ProductoData | null> => {
  const rows = await query<{
    id: string;
    nombre: string;
    descripcion: string | null;
    unidad: string | null;
    tiene_foto: boolean;
    puesto_id: string;
    puesto_nombre: string;
    precio: string;
  }>(
    `SELECT p.id, p.nombre, p.descripcion, p.unidad,
            (p.imagen IS NOT NULL AND p.imagen LIKE 'data:%') AS tiene_foto,
            pu.id AS puesto_id, pu.nombre AS puesto_nombre, pr.precio
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true
     JOIN puestos pu ON pu.id = pr.puesto_id AND pu.activo = true AND pu.aprobado = true
     WHERE p.id = $1 AND (p.disponible IS NULL OR p.disponible = true)
     ORDER BY pr.precio ASC`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    producto: {
      id: rows[0].id,
      nombre: rows[0].nombre,
      descripcion: rows[0].descripcion,
      unidad: rows[0].unidad,
      tiene_foto: rows[0].tiene_foto,
    },
    ofertas: rows.map((r) => ({ puesto_id: r.puesto_id, puesto_nombre: r.puesto_nombre, precio: Number(r.precio) })),
  };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProducto(id);
  if (!data) return { title: "Producto no encontrado · Mercadito" };

  const precioMin = Math.min(...data.ofertas.map((o) => o.precio));
  const titulo = `${data.producto.nombre} · $${precioMin} — Mercadito`;
  const desc =
    data.producto.descripcion ||
    "Pídelo en Mercadito, delivery local en Sahuayo, Jiquilpan y V. Carranza.";
  // OG image debe ser URL absoluta (WhatsApp no acepta data-URLs). Si el
  // producto no tiene foto, cae al logo.
  const imagen = data.producto.tiene_foto
    ? `${BASE_URL}/api/productos/${id}/imagen`
    : `${BASE_URL}/logo.png`;
  const url = `${BASE_URL}/producto/${id}`;

  return {
    title: titulo,
    description: desc,
    openGraph: {
      title: titulo,
      description: desc,
      url,
      siteName: "Mercadito",
      type: "website",
      images: [{ url: imagen }],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: desc,
      images: [imagen],
    },
  };
}

export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProducto(id);
  if (!data) notFound();

  const { producto, ofertas } = data;
  const precioMin = Math.min(...ofertas.map((o) => o.precio));
  const unidad = producto.unidad ? ` / ${producto.unidad}` : "";

  return (
    <div className="min-h-screen bg-cream pb-12">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
          <h1 className="text-lg font-bold">Mercadito</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {producto.tiene_foto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/productos/${producto.id}/imagen`}
              alt={producto.nombre}
              className="w-full max-h-80 object-cover"
            />
          )}
          <div className="p-4">
            <h2 className="text-xl font-bold text-gray-800">{producto.nombre}</h2>
            <p className="text-brand-dark font-bold text-lg mt-1">
              Desde ${precioMin}
              <span className="text-gray-400 font-normal text-sm">{unidad}</span>
            </p>
            {producto.descripcion && (
              <p className="text-sm text-gray-600 mt-2 leading-snug">{producto.descripcion}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">
            {ofertas.length === 1 ? "Disponible en" : `Disponible en ${ofertas.length} tiendas`}
          </p>
          <div className="space-y-2">
            {ofertas.map((o) => (
              <div key={o.puesto_id} className="flex items-center justify-between border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                <span className="text-sm text-gray-700">🏪 {o.puesto_nombre}</span>
                <span className="text-sm font-bold text-gray-800">${o.precio}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Esta página es destino de deep links compartidos. Sin delivery
            /cliente rebota a /menus, así que el CTA llevaba a un callejón:
            ahora manda al directorio, que es donde se pide de verdad. */}
        <a
          href={DELIVERY_ACTIVO ? "/cliente" : "/menus"}
          className="block w-full text-center bg-brand text-white font-bold py-3.5 rounded-xl shadow-sm active:opacity-90"
        >
          {DELIVERY_ACTIVO ? "Pedir en Mercadito 🛵" : "Ver los menús 🍽️"}
        </a>

        <div className="text-center pt-2">
          <p className="text-[11px] text-gray-400">
            Delivery local en Sahuayo, Jiquilpan y V. Carranza ·{" "}
            <a href="https://mercadito.cx" className="underline">mercadito.cx</a>
          </p>
        </div>
      </main>
    </div>
  );
}
