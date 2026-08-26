import { query, queryOne } from "@/lib/db";

/**
 * Corte de caja a ciegas.
 *
 * El turno es la unidad: se abre con un fondo, se le registran entradas y
 * retiros de efectivo, y al cerrar el cajero declara cuánto TIENE sin ver
 * cuánto DEBERÍA tener. Recién entonces el sistema enseña la diferencia y la
 * firma con nombre y hora. Ese orden es todo el punto: si el cajero ve el
 * esperado antes de contar, el corte no detecta nada.
 *
 * Qué cuenta como efectivo esperado:
 *   fondo inicial + ventas cobradas en efectivo + entradas − retiros
 *
 * Las ventas son las cuentas de mesa cerradas durante el turno. Lo que el
 * negocio cobra por fuera (WhatsApp, mostrador sin registrar) no pasa por
 * Mercadito y por eso no entra — el corte lo dice explícitamente para que
 * nadie interprete un faltante que no existe.
 */

/** 'caja' es como se llama el efectivo en `cuentas.metodo_pago`. */
export const METODO_EFECTIVO = "caja";

export interface TurnoAbierto {
  id: string;
  caja: string;
  fondo_inicial: number;
  abierto_at: string;
  abierto_por_nombre: string | null;
}

export interface TotalesTurno {
  /** Efectivo que ENTRÓ al cajón: ventas cobradas en efectivo más las propinas
   *  que se pagaron en efectivo. Si el cliente entrega $120 por un ticket de
   *  $100 con $20 de propina, en el cajón hay $120 — contar sólo $100 haría
   *  aparecer un sobrante de $20 todas las noches. Si el negocio reparte las
   *  propinas al cerrar, eso es un retiro y se registra como tal. */
  ventas_efectivo: number;
  /** Cobradas con tarjeta — no tocan el cajón, pero van en el desglose. */
  ventas_tarjeta: number;
  ventas_transferencia: number;
  cuentas: number;
  propinas: number;
  entradas: number;
  retiros: number;
  /** fondo + efectivo + entradas − retiros. Es el número que NO debe ver el
   *  cajero antes de declarar. */
  esperado: number;
}

/**
 * Turno abierto de una caja (o de cualquiera de sus cajas si no se especifica).
 *
 * Tolerante a fallo a propósito: esto se consulta al CERRAR una cuenta, y el
 * corte de caja es un módulo opcional. Si la tabla no existiera (migración que
 * no corrió), cobrar una mesa no puede reventar por eso — se cobra igual y la
 * venta simplemente no entra a ningún corte.
 */
export async function turnoAbierto(puestoId: string, caja?: string): Promise<TurnoAbierto | null> {
  const row = await queryOne<{
    id: string; caja: string; fondo_inicial: string; abierto_at: string; abierto_por_nombre: string | null;
  }>(
    `SELECT id, caja, fondo_inicial, abierto_at, abierto_por_nombre
     FROM caja_turnos
     WHERE puesto_id = $1 AND cerrado_at IS NULL ${caja ? "AND caja = $2" : ""}
     ORDER BY abierto_at DESC LIMIT 1`,
    caja ? [puestoId, caja] : [puestoId]
  ).catch(() => null);
  if (!row) return null;
  return {
    id: row.id, caja: row.caja,
    fondo_inicial: Number(row.fondo_inicial),
    abierto_at: row.abierto_at,
    abierto_por_nombre: row.abierto_por_nombre,
  };
}

/** Totales de un turno. Se calcula igual estando abierto o cerrado; quién
 *  puede VERLO es decisión de la ruta, no de aquí. */
export async function totalesTurno(turnoId: string, fondoInicial: number): Promise<TotalesTurno> {
  // Total de una cuenta = suma de sus pedidos no cancelados (el comensal manda
  // a cocina varias veces y cada envío es un pedido).
  // Dinero por método. Con pago mixto el total NO se puede atribuir a un solo
  // método: se reparte según el desglose de la columna `pagos`. Sin desglose
  // (cuentas de mesa, ventas viejas) todo va al método único, como siempre.
  // El LATERAL multiplica filas por método, así que esta query sirve SOLO para
  // sumar montos — contar cuentas y propinas aquí las duplicaría.
  const ventas = await queryOne<{ efectivo: string; tarjeta: string; transferencia: string }>(
    `SELECT
       COALESCE(SUM(t.monto) FILTER (WHERE t.metodo = $2), 0) AS efectivo,
       COALESCE(SUM(t.monto) FILTER (WHERE t.metodo = 'tarjeta'), 0) AS tarjeta,
       COALESCE(SUM(t.monto) FILTER (WHERE t.metodo = 'transferencia'), 0) AS transferencia
     FROM (
       -- Con desglose (mostrador) el monto ya viene como lo entregó el
       -- cliente, propina incluida. Sin desglose (mesa) se suma la propina al
       -- método con el que se pagó la cuenta: también entró al cajón.
       SELECT COALESCE(pg.metodo, c.metodo_pago) AS metodo,
              COALESCE(pg.monto, (
                SELECT COALESCE(SUM(pe.total), 0) FROM pedidos pe
                WHERE pe.cuenta_id = c.id AND pe.estado <> 'cancelado'
              ) + COALESCE(c.propina, 0)) AS monto
       FROM cuentas c
       LEFT JOIN LATERAL jsonb_to_recordset(
         CASE WHEN jsonb_typeof(c.pagos) = 'array' THEN c.pagos ELSE '[]'::jsonb END
       ) AS pg(metodo text, monto numeric) ON true
       WHERE c.turno_id = $1 AND c.estado = 'cerrada'
     ) t`,
    [turnoId, METODO_EFECTIVO]
  );

  // Cuentas y propinas, una fila por cuenta.
  const conteo = await queryOne<{ cuentas: number; propinas: string }>(
    `SELECT COUNT(*)::int AS cuentas, COALESCE(SUM(COALESCE(propina, 0)), 0) AS propinas
     FROM cuentas WHERE turno_id = $1 AND estado = 'cerrada'`,
    [turnoId]
  );

  const movs = await queryOne<{ entradas: string; retiros: string }>(
    `SELECT COALESCE(SUM(monto) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
            COALESCE(SUM(monto) FILTER (WHERE tipo = 'retiro'), 0) AS retiros
     FROM caja_movimientos WHERE turno_id = $1`,
    [turnoId]
  );

  const ventasEfectivo = Number(ventas?.efectivo ?? 0);
  const entradas = Number(movs?.entradas ?? 0);
  const retiros = Number(movs?.retiros ?? 0);
  // `propinas` es informativo: lo que se recibió de propina en el turno, sin
  // importar el método. NO se suma aparte al esperado — la parte que se pagó
  // en efectivo ya viene dentro de ventasEfectivo, y sumarla otra vez
  // inventaría un faltante del mismo tamaño.
  return {
    ventas_efectivo: ventasEfectivo,
    ventas_tarjeta: Number(ventas?.tarjeta ?? 0),
    ventas_transferencia: Number(ventas?.transferencia ?? 0),
    cuentas: Number(conteo?.cuentas ?? 0),
    propinas: Number(conteo?.propinas ?? 0),
    entradas,
    retiros,
    esperado: Math.round((fondoInicial + ventasEfectivo + entradas - retiros) * 100) / 100,
  };
}

/** Movimientos de efectivo del turno, del más reciente al más viejo. */
export async function movimientosTurno(turnoId: string) {
  const rows = await query<{
    id: string; tipo: string; monto: string; motivo: string | null;
    usuario_nombre: string | null; created_at: string;
  }>(
    `SELECT id, tipo, monto, motivo, usuario_nombre, created_at
     FROM caja_movimientos WHERE turno_id = $1 ORDER BY created_at DESC`,
    [turnoId]
  );
  return rows.map((m) => ({
    id: m.id, tipo: m.tipo, monto: Number(m.monto), motivo: m.motivo,
    usuario_nombre: m.usuario_nombre, created_at: m.created_at,
  }));
}

/** Monto válido de dinero: positivo, finito y con tope sano. Los montos los
 *  teclea gente con prisa y un cero de más arruina el corte del día. */
export function montoValido(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}
