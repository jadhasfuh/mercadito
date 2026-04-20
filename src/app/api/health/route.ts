import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", message: "Database unreachable" }, { status: 500 });
  }
}
