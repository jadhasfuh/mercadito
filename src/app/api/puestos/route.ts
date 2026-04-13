import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const puestos = await query("SELECT * FROM puestos WHERE activo = true ORDER BY nombre");
  return NextResponse.json(puestos);
}
