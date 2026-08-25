import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { apiFetch } from "../api/client";

// Resumen del admin SIN delivery: en vez de ventas, comisiones, envíos y
// liquidaciones de repartidores, lo que importa es quién paga, quién está por
// vencer y cuánto entra al mes. Espejo de src/components/AdminResumenMenus.tsx
// en web; el resumen de la época de delivery sigue en (admin)/resumen.tsx.

interface Panel {
  suscripciones: { pagando: number; prueba: number; vencidos: number; por_vencer: number };
  negocios: { total: number; con_menu: number; sin_whatsapp: number };
  usuarios: { clientes: number; tiendas: number; nuevos_semana: number };
  actividad: { vistas: number; pedidos: number };
  ingreso_mensual: number;
  ingreso_potencial: number;
  precio_mensual: number;
  por_vencer: { id: string; nombre: string; hasta: string; plan: string; dias: number }[];
  top_menus: { id: string; nombre: string; vistas: number; pedidos: number }[];
}

const money = (n: number) => `$${n.toLocaleString("es-MX")}`;

function Tarjeta({ valor, etiqueta, nota, tono }: {
  valor: string; etiqueta: string; nota?: string; tono?: "bien" | "alerta";
}) {
  return (
    <View style={styles.card}>
      <Text style={[styles.valor, tono === "bien" && styles.valorBien, tono === "alerta" && styles.valorAlerta]}>
        {valor}
      </Text>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      {nota ? <Text style={styles.nota}>{nota}</Text> : null}
    </View>
  );
}

export default function AdminResumenMenus() {
  const [d, setD] = useState<Panel | null>(null);
  const [error, setError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setD(await apiFetch<Panel>("/api/admin/panel"));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <Text style={styles.vacio}>No se pudo cargar el resumen.</Text>;
  if (!d) return <Text style={styles.vacio}>Cargando…</Text>;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
    >
      {/* Dinero primero: es la pregunta que se contesta al abrir el panel. */}
      <View style={styles.row}>
        <Tarjeta
          valor={money(d.ingreso_mensual)}
          etiqueta="Al mes, hoy"
          nota={`${d.suscripciones.pagando} pagando × ${money(d.precio_mensual)}`}
          tono="bien"
        />
        <Tarjeta
          valor={money(d.ingreso_potencial)}
          etiqueta="Si convierten las pruebas"
          nota={`+${d.suscripciones.prueba} en prueba`}
        />
      </View>

      <View style={styles.row}>
        <Tarjeta valor={String(d.suscripciones.pagando)} etiqueta="Pagando" tono="bien" />
        <Tarjeta valor={String(d.suscripciones.prueba)} etiqueta="En prueba" />
        <Tarjeta
          valor={String(d.suscripciones.vencidos)}
          etiqueta="Vencidos"
          tono={d.suscripciones.vencidos > 0 ? "alerta" : undefined}
        />
      </View>

      {/* A quién cobrarle. Es la acción del panel, no un dato de adorno. */}
      {d.por_vencer.length > 0 && (
        <View style={styles.bloque}>
          <Text style={styles.titulo}>Vencen pronto ({d.por_vencer.length})</Text>
          {d.por_vencer.map((p) => (
            <View key={p.id} style={styles.fila}>
              <Text style={styles.filaNombre} numberOfLines={1}>{p.nombre}</Text>
              <View style={[styles.pill, p.dias <= 3 ? styles.pillRojo : styles.pillAmbar]}>
                <Text style={[styles.pillTxt, p.dias <= 3 ? styles.pillTxtRojo : styles.pillTxtAmbar]}>
                  {p.dias === 0 ? "hoy" : p.dias === 1 ? "1 día" : `${p.dias} días`}
                </Text>
              </View>
              <Text style={styles.filaPlan}>{p.plan === "pro" ? "Pro" : "prueba"}</Text>
            </View>
          ))}
          <Text style={styles.pie}>Cobra antes de la fecha o pierden acceso a mesas y reservas.</Text>
        </View>
      )}

      <View style={styles.row}>
        <Tarjeta valor={String(d.negocios.con_menu)} etiqueta="Con menú" nota={`de ${d.negocios.total}`} />
        <Tarjeta valor={String(d.usuarios.clientes)} etiqueta="Clientes" />
        <Tarjeta valor={String(d.usuarios.nuevos_semana)} etiqueta="Nuevos (7d)" />
      </View>

      {/* Sin WhatsApp = su menú se ve pero no puede recibir pedidos. Es el
          problema más caro que puede tener un negocio aquí. */}
      {d.negocios.sin_whatsapp > 0 && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>
            {d.negocios.sin_whatsapp} {d.negocios.sin_whatsapp === 1 ? "negocio" : "negocios"} sin WhatsApp
          </Text>
          <Text style={styles.avisoTxt}>
            Su menú se ve, pero nadie les puede mandar un pedido.
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Tarjeta valor={d.actividad.vistas.toLocaleString("es-MX")} etiqueta="Vistas de menú" nota="acumulado" />
        <Tarjeta valor={d.actividad.pedidos.toLocaleString("es-MX")} etiqueta="Pedidos generados" nota="acumulado" />
      </View>

      {d.top_menus.length > 0 && (
        <View style={styles.bloque}>
          <Text style={styles.titulo}>Menús más vistos</Text>
          {d.top_menus.map((m, i) => (
            <View key={m.id} style={styles.fila}>
              <Text style={styles.filaIdx}>{i + 1}</Text>
              <Text style={styles.filaNombre} numberOfLines={1}>{m.nombre}</Text>
              <Text style={styles.filaDato}>{m.vistas} vistas</Text>
              {m.pedidos > 0 ? <Text style={styles.filaDatoVerde}>{m.pedidos} ped.</Text> : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: "#9CA3AF", paddingVertical: 40 },
  row: { flexDirection: "row", gap: 10 },
  card: { flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#F3F4F6" },
  valor: { fontSize: 20, fontWeight: "900", color: "#111827" },
  valorBien: { color: "#047857" },
  valorAlerta: { color: "#B45309" },
  etiqueta: { fontSize: 11, fontWeight: "700", color: "#6B7280", marginTop: 2 },
  nota: { fontSize: 10, color: "#9CA3AF", marginTop: 1 },
  bloque: { backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#F3F4F6", gap: 6 },
  titulo: { fontSize: 13, fontWeight: "800", color: "#1F2937", marginBottom: 2 },
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  filaIdx: { width: 16, fontSize: 12, fontWeight: "800", color: "#D1D5DB" },
  filaNombre: { flex: 1, minWidth: 0, fontSize: 13, color: "#374151" },
  filaPlan: { width: 46, textAlign: "right", fontSize: 10, color: "#9CA3AF" },
  filaDato: { fontSize: 12, color: "#6B7280" },
  filaDatoVerde: { fontSize: 12, fontWeight: "700", color: "#047857" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillRojo: { backgroundColor: "#FEF2F2" },
  pillAmbar: { backgroundColor: "#FFFBEB" },
  pillTxt: { fontSize: 11, fontWeight: "800" },
  pillTxtRojo: { color: "#DC2626" },
  pillTxtAmbar: { color: "#B45309" },
  pie: { fontSize: 10, color: "#9CA3AF", marginTop: 4 },
  aviso: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 16, padding: 12 },
  avisoTitulo: { fontSize: 13, fontWeight: "800", color: "#78350F" },
  avisoTxt: { fontSize: 12, color: "#92400E", marginTop: 2 },
});
