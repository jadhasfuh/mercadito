import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { theme } from "../lib/theme";
import { resumenNegocio, type ResumenNegocio as Datos } from "../api/tienda";

const PERIODOS = [7, 15, 30];

const diaCorto = (fecha: string) => {
  // La fecha viene ya en hora de México como "YYYY-MM-DD"; se parte a mano
  // para que el dispositivo no la corra un día por la zona horaria.
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
};
const hora12 = (h: number) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);
const money = (n: number) => `$${n.toFixed(0)}`;

/**
 * "Tu resumen" — el negocio visto por sus propios números.
 * Espejo de src/components/TiendaResumen.tsx (web).
 */
export default function ResumenNegocio() {
  const [dias, setDias] = useState(7);
  const [data, setData] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);

  // Sin setCargando aquí: el spinner se prende al cambiar de periodo (que es
  // un evento) y arranca prendido en el primer render. Así el effect no hace
  // setState de forma síncrona y no encadena renders de más.
  const cargar = useCallback(() => {
    resumenNegocio(dias)
      .then(setData)
      .finally(() => setCargando(false));
  }, [dias]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !data) return <Text style={styles.cargando}>Cargando tu resumen…</Text>;
  if (!data) return null;

  const { menu, mas_vendidos: top, mesas } = data;
  const maxDia = Math.max(1, ...mesas.por_dia.map((d) => d.total));
  const maxTop = Math.max(1, ...top.map((t) => t.pedidos));

  return (
    <View style={{ gap: 12 }}>
      {/* ── Menú digital ──────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.titulo}>Tu menú digital</Text>
        <Text style={styles.sub}>Desde que lo publicaste</Text>
        <View style={styles.datos}>
          <Dato n={menu.vistas.toLocaleString("es-MX")} label="veces abierto" />
          <Dato n={menu.pedidos.toLocaleString("es-MX")} label="pedidos enviados" />
          <Dato n={menu.conversion != null ? `${menu.conversion}%` : "—"} label="de los que abren, piden" />
        </View>
        {menu.vistas === 0 && (
          <Text style={styles.nota}>
            Todavía nadie ha abierto tu menú. Comparte tu enlace por WhatsApp o pega tu QR en el mostrador.
          </Text>
        )}
      </View>

      {/* ── Más vendidos ─────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.titulo}>Lo que más se pide</Text>
        <Text style={styles.sub}>Pedidos de tu menú y comandas de mesa</Text>
        {top.length === 0 ? (
          <Text style={styles.nota}>
            Todavía no hay pedidos suficientes. En cuanto empiecen a llegar, aquí sale tu top.
          </Text>
        ) : (
          top.map((t, i) => (
            <View key={t.producto_id} style={styles.topFila}>
              <Text style={styles.topPos}>{i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.topNombre} numberOfLines={1}>{t.nombre}</Text>
                <View style={styles.barraFondo}>
                  <View style={[styles.barra, { width: `${(t.pedidos / maxTop) * 100}%` }]} />
                </View>
              </View>
              <Text style={styles.topNum}>{t.pedidos}</Text>
            </View>
          ))
        )}
      </View>

      {/* ── Ventas de mesa ───────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Ventas en mesa</Text>
            <Text style={styles.sub}>Cuentas que cerraste</Text>
          </View>
          <View style={styles.periodos}>
            {PERIODOS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => { setCargando(true); setDias(d); }}
                style={[styles.periodo, dias === d && styles.periodoOn]}
              >
                <Text style={[styles.periodoTxt, dias === d && styles.periodoTxtOn]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {mesas.cuentas === 0 ? (
          <Text style={styles.nota}>
            No cerraste ninguna cuenta en este periodo. Lo que cobras por fuera —WhatsApp, mostrador— no
            pasa por aquí, así que no lo podemos contar.
          </Text>
        ) : (
          <>
            <View style={styles.datos}>
              <Dato n={money(mesas.total)} label="vendido" />
              <Dato n={String(mesas.cuentas)} label={mesas.cuentas === 1 ? "cuenta" : "cuentas"} />
              <Dato n={money(mesas.ticket_promedio)} label="ticket promedio" />
            </View>
            {mesas.propinas > 0 && (
              <Text style={styles.nota}>Más {money(mesas.propinas)} de propinas registradas.</Text>
            )}

            {mesas.por_dia.length > 0 && (
              <>
                <Text style={styles.seccion}>Por día</Text>
                <View style={styles.grafica}>
                  {mesas.por_dia.map((d) => (
                    <View key={d.fecha} style={styles.columna}>
                      <View style={styles.columnaFondo}>
                        <View style={[styles.columnaBarra, { height: `${Math.max(4, (d.total / maxDia) * 100)}%` }]} />
                      </View>
                      <Text style={styles.columnaLabel} numberOfLines={1}>{diaCorto(d.fecha)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {mesas.horas_pico.length > 0 && (
              <>
                <Text style={styles.seccion}>Tus horas más fuertes</Text>
                <View style={styles.chips}>
                  {mesas.horas_pico.map((h) => (
                    <View key={h.hora} style={styles.chip}>
                      <Text style={styles.chipTxt}>
                        {hora12(h.hora)} · {h.cuentas} {h.cuentas === 1 ? "cuenta" : "cuentas"}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Dato({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoN}>{n}</Text>
      <Text style={styles.datoL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cargando: { textAlign: "center", color: theme.colors.gray400, paddingVertical: 32 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, ...theme.shadow.sm },
  cabecera: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  titulo: { fontSize: 15, fontWeight: "800", color: theme.colors.gray800 },
  sub: { fontSize: 11, color: theme.colors.gray400, marginTop: 1, marginBottom: 10 },
  nota: { fontSize: 12, color: theme.colors.gray500, lineHeight: 17, marginTop: 8 },
  seccion: {
    fontSize: 10.5, fontWeight: "800", color: theme.colors.gray400, letterSpacing: 0.5,
    textTransform: "uppercase", marginTop: 16, marginBottom: 8,
  },
  datos: { flexDirection: "row", gap: 8 },
  dato: { flex: 1, backgroundColor: theme.colors.gray50, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  datoN: { fontSize: 18, fontWeight: "800", color: theme.colors.gray800, fontVariant: ["tabular-nums"] },
  datoL: { fontSize: 10, color: theme.colors.gray400, marginTop: 2, lineHeight: 13 },
  topFila: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  topPos: { width: 14, fontSize: 11, fontWeight: "800", color: theme.colors.gray400, fontVariant: ["tabular-nums"] },
  topNombre: { fontSize: 13.5, color: theme.colors.gray700 },
  barraFondo: { height: 6, backgroundColor: theme.colors.gray100, borderRadius: 999, marginTop: 4, overflow: "hidden" },
  barra: { height: 6, backgroundColor: theme.colors.brand, borderRadius: 999 },
  topNum: { fontSize: 13.5, fontWeight: "800", color: theme.colors.gray800, fontVariant: ["tabular-nums"] },
  periodos: { flexDirection: "row", gap: 4 },
  periodo: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.gray100 },
  periodoOn: { backgroundColor: theme.colors.brand },
  periodoTxt: { fontSize: 11, fontWeight: "800", color: theme.colors.gray500 },
  periodoTxtOn: { color: "#fff" },
  grafica: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 96 },
  columna: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  columnaFondo: { flex: 1, width: "100%", backgroundColor: theme.colors.gray100, borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  columnaBarra: { width: "100%", backgroundColor: theme.colors.brand, borderRadius: 4 },
  columnaLabel: { fontSize: 9, color: theme.colors.gray400 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: theme.colors.brandLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipTxt: { fontSize: 12, fontWeight: "700", color: theme.colors.navy },
});
