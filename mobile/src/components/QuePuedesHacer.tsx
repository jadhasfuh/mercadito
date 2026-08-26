import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { theme } from "../lib/theme";
import { FUNCIONES, type ClaveFuncion } from "../lib/funciones";
import { funcionesNegocio, type EstadoFuncion } from "../api/tienda";

/**
 * "Qué puedes hacer con Mercadito" — el centro de ayuda, dentro de la app.
 * Espejo de src/components/QuePuedesHacer.tsx (web).
 *
 * En vez de vender lo que el producto hace, dice cuáles de esas cosas el
 * negocio YA está usando y cuáles tiene sin estrenar. Muchos pagan la
 * suscripción sin saber que tienen mesas, comandas o meseros.
 */
export default function QuePuedesHacer({ onIr }: { onIr?: (clave: ClaveFuncion) => void }) {
  const [estado, setEstado] = useState<Record<string, EstadoFuncion> | null>(null);
  const [abierta, setAbierta] = useState<ClaveFuncion | null>(null);

  useEffect(() => {
    let vivo = true;
    funcionesNegocio().then((d) => { if (vivo) setEstado(d); });
    return () => { vivo = false; };
  }, []);

  if (!estado) return <Text style={styles.cargando}>Cargando…</Text>;

  // Las que no aplican al giro no se muestran: a un negocio de puras reservas
  // no le sirve leer sobre comandas de cocina.
  const visibles = FUNCIONES.filter((f) => estado[f.clave]?.aplica !== false);
  const sinUsar = visibles.filter((f) => !estado[f.clave]?.activado).length;

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Qué puedes hacer con Mercadito</Text>
      <Text style={styles.sub}>
        {sinUsar === 0
          ? "Estás usando todo lo que incluye tu plan."
          : `${sinUsar} ${sinUsar === 1 ? "función que tienes y no estás usando" : "funciones que tienes y no estás usando"}.`}
      </Text>

      {visibles.map((f) => {
        const activo = !!estado[f.clave]?.activado;
        const open = abierta === f.clave;
        return (
          <View key={f.clave} style={styles.item}>
            <TouchableOpacity
              onPress={() => setAbierta(open ? null : f.clave)}
              style={styles.itemHead}
              activeOpacity={0.75}
            >
              <Text style={styles.icono}>{f.icono}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemTitulo}>{f.titulo}</Text>
                <Text style={styles.itemPara}>{f.para}</Text>
              </View>
              <View style={[styles.badge, activo ? styles.badgeOn : styles.badgeOff]}>
                <Text style={[styles.badgeTxt, activo ? styles.badgeTxtOn : styles.badgeTxtOff]}>
                  {activo ? "Activado" : "Sin usar"}
                </Text>
              </View>
            </TouchableOpacity>

            {open && (
              <View style={styles.pasos}>
                {f.pasos.map((paso, i) => (
                  <View key={paso} style={styles.paso}>
                    <View style={styles.pasoNum}>
                      <Text style={styles.pasoNumTxt}>{i + 1}</Text>
                    </View>
                    <Text style={styles.pasoTxt}>{paso}</Text>
                  </View>
                ))}
                {!activo && onIr && (
                  <TouchableOpacity onPress={() => onIr(f.clave)} style={styles.cta} activeOpacity={0.85}>
                    <Text style={styles.ctaTxt}>{f.accion}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cargando: { textAlign: "center", color: theme.colors.gray400, paddingVertical: 24, fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, ...theme.shadow.sm },
  titulo: { fontSize: 15, fontWeight: "800", color: theme.colors.gray800 },
  sub: { fontSize: 11, color: theme.colors.gray400, marginTop: 2, marginBottom: 10 },
  item: { borderWidth: 1, borderColor: theme.colors.gray100, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 11 },
  icono: { fontSize: 19 },
  itemTitulo: { fontSize: 13.5, fontWeight: "800", color: theme.colors.gray800 },
  itemPara: { fontSize: 11.5, color: theme.colors.gray500, lineHeight: 16, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ECFDF5" },
  badgeOff: { backgroundColor: theme.colors.gray100 },
  badgeTxt: { fontSize: 10, fontWeight: "800" },
  badgeTxtOn: { color: "#047857" },
  badgeTxtOff: { color: theme.colors.gray500 },
  pasos: { paddingHorizontal: 10, paddingBottom: 12, paddingTop: 2, backgroundColor: theme.colors.gray50 },
  paso: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 6 },
  pasoNum: {
    width: 18, height: 18, borderRadius: 999, backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  pasoNumTxt: { fontSize: 10, fontWeight: "800", color: "#fff" },
  pasoTxt: { flex: 1, fontSize: 12.5, color: theme.colors.gray700, lineHeight: 17 },
  cta: { backgroundColor: theme.colors.brand, borderRadius: 12, paddingVertical: 11, alignItems: "center", marginTop: 6 },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
});
