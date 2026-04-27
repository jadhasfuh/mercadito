import { View, TextInput, TouchableOpacity, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Barra de búsqueda con el mismo look de src/components/SearchBar.tsx en
 * web — pill blanca, lupa a la izquierda, texto, botón × cuando hay query.
 */
export default function SearchBar({ value, onChange, placeholder = "Buscar producto..." }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search-outline" size={16} color="#9CA3AF" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={styles.input}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")} style={styles.clear} accessibilityLabel="Limpiar búsqueda">
          <Text style={styles.clearTxt}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Misma firma y comportamiento que el helper de web. */
export function matchProducto(
  query: string,
  nombre: string,
  descripcion?: string | null,
  ...extras: (string | null | undefined)[]
): boolean {
  const q = normalizar(query);
  if (!q) return true;
  if (normalizar(nombre).includes(q)) return true;
  if (descripcion && normalizar(descripcion).includes(q)) return true;
  for (const x of extras) {
    if (x && normalizar(x).includes(q)) return true;
  }
  return false;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  input: { flex: 1, fontSize: 14, color: "#1F2937", paddingVertical: 4 },
  clear: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  clearTxt: { fontSize: 16, color: "#6B7280", fontWeight: "700", lineHeight: 18 },
});
