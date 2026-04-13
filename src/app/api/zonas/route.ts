import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const zonas = await query("SELECT * FROM zonas_entrega WHERE activa = true ORDER BY costo_envio");
  return NextResponse.json(zonas);
}
