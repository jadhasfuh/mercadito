import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { minutosDesde, textoEspera, nivelEspera, COLOR_ESPERA } from "../lib/espera";

/** Reloj compartido del board: un solo intervalo para todos los chips en
 *  pantalla, en vez de uno por comanda. Tick de 15 s — el chip muestra
 *  minutos, así que más frecuencia solo gastaría renders. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

/**
 * Cuánto lleva esperando una comanda. Verde, ámbar o rojo según el tiempo,
 * para que cocina vea qué se está atrasando sin leer ningún número.
 * Espejo de src/components/ChipEspera.tsx (web).
 */
export default function ChipEspera({ desde }: { desde: string | null | undefined }) {
  const ahora = useAhora();
  const min = minutosDesde(desde, ahora);
  if (min == null) return null;
  const c = COLOR_ESPERA[nivelEspera(min)];
  return (
    <View style={[styles.chip, { backgroundColor: c.fondo }]}>
      <Text style={[styles.txt, { color: c.texto }]}>⏱ {textoEspera(min)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  txt: { fontSize: 10.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
