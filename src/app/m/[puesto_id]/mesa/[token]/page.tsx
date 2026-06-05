import type { Metadata } from "next";
import MesaCliente from "@/components/MesaCliente";

export const metadata: Metadata = { title: "Pedir en mesa · Mercadito" };

export default async function MesaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MesaCliente token={token} />;
}
