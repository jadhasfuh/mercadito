import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";

const DOW = ["D", "L", "M", "M", "J", "V", "S"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Calendario mensual con navegación limitada de hoy a +N meses. Los días fuera
// de rango (pasado o más allá del tope) quedan deshabilitados.
export default function CalendarioMes({
  selected,
  onSelect,
  accent = theme.colors.serv,
  mesesAdelante = 3,
}: {
  selected: string;
  onSelect: (ymd: string) => void;
  accent?: string;
  mesesAdelante?: number;
}) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const max = new Date(hoy);
  max.setMonth(max.getMonth() + mesesAdelante);

  const [view, setView] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() });

  const minIdx = hoy.getFullYear() * 12 + hoy.getMonth();
  const maxIdx = max.getFullYear() * 12 + max.getMonth();
  const viewIdx = view.y * 12 + view.m;

  const primerDia = new Date(view.y, view.m, 1).getDay();
  const diasMes = new Date(view.y, view.m + 1, 0).getDate();

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDia; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(d);

  function cambiarMes(delta: number) {
    const idx = viewIdx + delta;
    if (idx < minIdx || idx > maxIdx) return;
    setView({ y: Math.floor(idx / 12), m: idx % 12 });
  }

  const puedeAtras = viewIdx > minIdx;
  const puedeAdelante = viewIdx < maxIdx;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => cambiarMes(-1)} disabled={!puedeAtras} style={styles.nav}>
          <Ionicons name="chevron-back" size={22} color={puedeAtras ? theme.colors.gray700 : theme.colors.gray300} />
        </TouchableOpacity>
        <Text style={styles.mes}>
          {MESES[view.m]} {view.y}
        </Text>
        <TouchableOpacity onPress={() => cambiarMes(1)} disabled={!puedeAdelante} style={styles.nav}>
          <Ionicons name="chevron-forward" size={22} color={puedeAdelante ? theme.colors.gray700 : theme.colors.gray300} />
        </TouchableOpacity>
      </View>

      <View style={styles.dowRow}>
        {DOW.map((d, i) => (
          <Text key={i} style={styles.dowTxt}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {celdas.map((d, i) => {
          if (d == null) return <View key={`b${i}`} style={styles.celda} />;
          const date = new Date(view.y, view.m, d);
          const key = ymd(date);
          const disabled = date < hoy || date > max;
          const sel = key === selected;
          return (
            <TouchableOpacity
              key={key}
              style={styles.celda}
              disabled={disabled}
              onPress={() => onSelect(key)}
              activeOpacity={0.8}
            >
              <View style={[styles.dia, sel && { backgroundColor: accent }]}>
                <Text style={[styles.diaTxt, disabled && styles.diaOff, sel && styles.diaSel]}>{d}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: 12,
    ...theme.shadow.sm,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  nav: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  mes: { ...theme.typography.title, color: theme.colors.gray900 },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dowTxt: { flex: 1, textAlign: "center", ...theme.typography.caption, color: theme.colors.gray400 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  celda: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  dia: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  diaTxt: { ...theme.typography.bodyMedium, color: theme.colors.gray800 },
  diaOff: { color: theme.colors.gray300 },
  diaSel: { color: "#fff", fontFamily: theme.fontFamily.bold },
});
