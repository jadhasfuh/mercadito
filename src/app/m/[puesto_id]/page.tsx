import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMenuPublico } from "@/lib/menu";
import MenuPublico from "@/components/MenuPublico";

const BASE_URL = "https://mercadito.cx";

export async function generateMetadata({ params }: { params: Promise<{ puesto_id: string }> }): Promise<Metadata> {
  const { puesto_id } = await params;
  const menu = await getMenuPublico(puesto_id);
  if (!menu) return { title: "Menú no encontrado · Mercadito" };
  const titulo = `${menu.puesto.nombre} · Menú — Mercadito`;
  const desc = menu.puesto.descripcion || "Mira el menú y pide en Mercadito.";
  const imagen = menu.puesto.logo?.startsWith("http") ? menu.puesto.logo : `${BASE_URL}/logo.png`;
  const url = `${BASE_URL}/m/${puesto_id}`;
  return {
    title: titulo,
    description: desc,
    openGraph: { title: titulo, description: desc, url, siteName: "Mercadito", type: "website", images: [{ url: imagen }] },
    twitter: { card: "summary_large_image", title: titulo, description: desc, images: [imagen] },
  };
}

export default async function MenuPage({ params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;
  const menu = await getMenuPublico(puesto_id);
  if (!menu) notFound();

  const vencido = menu.planInfo.estado === "vencido";

  return (
    <>
      <MenuPublico
        menu={menu}
        encabezado={
          vencido ? (
            <div className="max-w-lg mx-auto px-4 pt-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 text-center">
                Menú en modo básico. La tienda puede activar el plan Pro para pedidos en mesa y personalización.
              </div>
            </div>
          ) : null
        }
      />
      {/* CTA fija: pedir a domicilio por Mercadito */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t">
        <div className="max-w-lg mx-auto px-4 py-3">
          <a
            href="/cliente"
            className="block w-full text-center text-white font-bold py-3.5 rounded-xl shadow-sm active:opacity-90"
            style={{ backgroundColor: menu.puesto.color_marca || "#ED8E3C" }}
          >
            Pedir a domicilio 🛵
          </a>
        </div>
      </div>
    </>
  );
}
