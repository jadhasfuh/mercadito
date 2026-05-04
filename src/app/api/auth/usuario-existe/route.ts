import { queryOne } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/auth/usuario-existe?telefono=...&rol=tienda|admin
//
// Equivalente a /api/auth/cliente-existe pero para roles con login por
// PIN obligatorio (tienda/repartidor/admin). El form de login usa esta
// info para decidir entre "Tu PIN" (usuario con PIN) y "Crea tu PIN"
// (usuario sin PIN — cuentas viejas o reseteadas).
//
// rol="tienda" cubre tienda+repartidor (form web los maneja juntos).
// rol="repartidor" busca solo repartidor (mobile los separa por tab).
// rol="admin" busca solo admin.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const telefono = (searchParams.get("telefono") || "").replace(/\D/g, "");
  const rol = searchParams.get("rol") || "";

  if (telefono.length < 10) {
    return NextResponse.json({ existe: false });
  }
  if (rol !== "tienda" && rol !== "admin" && rol !== "repartidor") {
    return NextResponse.json({ error: "rol inválido" }, { status: 400 });
  }

  const roles = rol === "tienda" ? ["tienda", "repartidor"] : [rol];
  // Prioridad: si el mismo tel tiene tienda + repartidor, preferir
  // tienda. El form /tienda/login usa esto para mostrar el PIN
  // correcto y para que el login posterior hit la fila correspondiente.
  const row = await queryOne<{ nombre: string; pin: string | null; rol: string }>(
    `SELECT nombre, pin, rol FROM usuarios
     WHERE telefono = $1 AND activo = true AND rol = ANY($2)
     ORDER BY CASE rol
       WHEN 'tienda' THEN 0
       WHEN 'admin' THEN 1
       WHEN 'repartidor' THEN 2
       ELSE 3
     END
     LIMIT 1`,
    [telefono, roles]
  );
  if (!row) {
    return NextResponse.json({ existe: false });
  }
  return NextResponse.json({
    existe: true,
    tiene_pin: !!row.pin,
    nombre: row.nombre,
    rol: row.rol,
  });
}
