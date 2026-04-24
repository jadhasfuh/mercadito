// Helper para aplicar (crear/reemplazar) las variantes y modificadores de un
// producto. Se llama tanto desde POST /api/productos como desde PATCH.
//
// Estrategia: borrar todas las opciones/variantes/modificadores existentes del
// producto y recrearlos desde el payload. Mapeamos ids temporales (enviados por
// el cliente) a ids reales generados aquí — así las variantes pueden referenciar
// valores recién insertados.
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

interface OpcionInput {
  id?: string; // id temporal del cliente (para mapear valores -> variantes)
  nombre: string;
  orden?: number;
  valores: { id?: string; valor: string; precio_extra?: number; orden?: number }[];
}

interface VarianteInput {
  nombre: string;
  precio_override?: number | null;
  precio_mayoreo_override?: number | null;
  mayoreo_desde_override?: number | null;
  activo?: boolean;
  orden?: number;
  valor_ids: string[]; // ids temporales que referencian opciones.valores[].id
}

interface ModificadorInput {
  nombre: string;
  obligatorio?: boolean;
  multiple?: boolean;
  maximo?: number | null;
  minimo?: number | null;
  orden?: number;
  opciones: { nombre: string; precio_extra?: number; orden?: number }[];
}

function generarCombinaciones(opciones: OpcionInput[]): VarianteInput[] {
  // Producto cartesiano de los valores de cada opción. Cada combinación es
  // una variante sin precio_override (el precio sale del sumatorio de extras).
  if (opciones.some((o) => !o.valores || o.valores.length === 0)) return [];
  const combos: { ids: string[]; nombres: string[] }[] = [{ ids: [], nombres: [] }];
  for (const op of opciones) {
    const next: typeof combos = [];
    for (const c of combos) {
      for (const v of op.valores) {
        if (!v.id) continue;
        next.push({ ids: [...c.ids, v.id], nombres: [...c.nombres, v.valor] });
      }
    }
    combos.splice(0, combos.length, ...next);
  }
  return combos.map((c, i) => ({
    nombre: c.nombres.join(" / "),
    valor_ids: c.ids,
    precio_override: null,
    precio_mayoreo_override: null,
    mayoreo_desde_override: null,
    activo: true,
    orden: i,
  }));
}

export async function aplicarOpcionesYVariantes(
  producto_id: string,
  opciones: OpcionInput[] | undefined,
  variantes: VarianteInput[] | undefined
) {
  // Borra todo lo existente del producto. Las FK con ON DELETE CASCADE se
  // encargan de producto_opcion_valores y variante_valores.
  await query("DELETE FROM producto_variantes WHERE producto_id = $1", [producto_id]);
  await query("DELETE FROM producto_opciones WHERE producto_id = $1", [producto_id]);

  if (!opciones?.length) return;

  // tempId -> realId para los valores, así las variantes pueden referenciarlos.
  const idMap = new Map<string, string>();

  for (const [i, op] of opciones.entries()) {
    const opId = uuidv4();
    await query(
      "INSERT INTO producto_opciones (id, producto_id, nombre, orden) VALUES ($1, $2, $3, $4)",
      [opId, producto_id, op.nombre, op.orden ?? i]
    );
    for (const [j, v] of op.valores.entries()) {
      const vId = uuidv4();
      await query(
        "INSERT INTO producto_opcion_valores (id, opcion_id, valor, precio_extra, orden) VALUES ($1, $2, $3, $4, $5)",
        [vId, opId, v.valor, Number(v.precio_extra ?? 0), v.orden ?? j]
      );
      if (v.id) idMap.set(v.id, vId);
    }
  }

  // Si el cliente no mandó variantes pero sí opciones con valores, generamos
  // automáticamente todas las combinaciones (producto cartesiano).
  let variantesFinales = variantes;
  if ((!variantes || variantes.length === 0) && opciones.length > 0) {
    variantesFinales = generarCombinaciones(opciones);
  }

  if (!variantesFinales?.length) return;

  for (const [i, vr] of variantesFinales.entries()) {
    const vId = uuidv4();
    await query(
      `INSERT INTO producto_variantes
        (id, producto_id, nombre, precio_override, precio_mayoreo_override, mayoreo_desde_override, activo, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        vId,
        producto_id,
        vr.nombre,
        vr.precio_override ?? null,
        vr.precio_mayoreo_override ?? null,
        vr.mayoreo_desde_override ?? null,
        vr.activo ?? true,
        vr.orden ?? i,
      ]
    );
    for (const tempVid of vr.valor_ids) {
      const realVid = idMap.get(tempVid);
      if (!realVid) continue;
      await query(
        "INSERT INTO variante_valores (variante_id, valor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [vId, realVid]
      );
    }
  }
}

export async function aplicarModificadores(
  producto_id: string,
  modificadores: ModificadorInput[] | undefined
) {
  await query("DELETE FROM producto_modificadores WHERE producto_id = $1", [producto_id]);
  if (!modificadores?.length) return;

  for (const [i, m] of modificadores.entries()) {
    const mId = uuidv4();
    await query(
      `INSERT INTO producto_modificadores
        (id, producto_id, nombre, obligatorio, multiple, maximo, minimo, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [mId, producto_id, m.nombre, !!m.obligatorio, !!m.multiple, m.maximo ?? null, m.minimo ?? null, m.orden ?? i]
    );
    for (const [j, o] of m.opciones.entries()) {
      await query(
        "INSERT INTO modificador_opciones (id, modificador_id, nombre, precio_extra, orden) VALUES ($1, $2, $3, $4, $5)",
        [uuidv4(), mId, o.nombre, Number(o.precio_extra ?? 0), o.orden ?? j]
      );
    }
  }
}
