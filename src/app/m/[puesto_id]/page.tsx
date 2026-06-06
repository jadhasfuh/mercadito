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

  // El menú digital es gratis para los negocios: se muestra completo sin
  // importar el plan. El plan Pro sólo aplica a mesas/reservas (otra pantalla).
  return <MenuPublico menu={menu} domicilio={{ puestoId: menu.puesto.id }} />;
}
