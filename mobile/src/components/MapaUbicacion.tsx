import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Keyboard } from "react-native";
import MapView, { Marker, type LatLng } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  valor: { lat: number; lng: number } | null;
  onCambio: (pos: { lat: number; lng: number }) => void;
  onDireccionDetectada?: (direccion: string) => void;
  altura?: number;
}

// Sahuayo centro como fallback
const DEFAULT_POS = { lat: 20.0463867, lng: -102.7229156 };

export default function MapaUbicacion({ valor, onCambio, onDireccionDetectada, altura = 260 }: Props) {
  const mapRef = useRef<MapView>(null);
  const [obteniendo, setObteniendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState({
    latitude: valor?.lat ?? DEFAULT_POS.lat,
    longitude: valor?.lng ?? DEFAULT_POS.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  useEffect(() => {
    if (valor) setRegion((r) => ({ ...r, latitude: valor.lat, longitude: valor.lng }));
  }, [valor]);

  async function reverseGeocode(lat: number, lng: number) {
    if (!onDireccionDetectada) return;
    try {
      const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (result[0]) {
        const r = result[0];
        const dir = [r.street, r.streetNumber, r.district ?? r.city, r.postalCode].filter(Boolean).join(", ");
        if (dir) onDireccionDetectada(dir);
      }
    } catch {
      // silent
    }
  }

  async function miUbicacion() {
    setObteniendo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso denegado", "Activa el permiso de ubicación para usar esta función.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onCambio(p);
      mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
      await reverseGeocode(p.lat, p.lng);
    } catch (e) {
      Alert.alert("Error", "No se pudo obtener tu ubicación");
      console.warn(e);
    } finally {
      setObteniendo(false);
    }
  }

  async function buscarDireccion() {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    setBuscando(true);
    try {
      // Nominatim (OSM) — gratis, sin API key. Restringido a México.
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=mx&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "Mercadito/1.0" } }
      );
      const data = await res.json();
      if (data?.[0]) {
        const p = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        onCambio(p);
        mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
        if (onDireccionDetectada && data[0].display_name) {
          const partes = String(data[0].display_name).split(",").slice(0, 3).join(", ").trim();
          if (partes) onDireccionDetectada(partes);
        }
      } else {
        Alert.alert("Sin resultados", `No encontramos "${q}". Intenta con calle y colonia.`);
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo buscar la dirección");
      console.warn(e);
    } finally {
      setBuscando(false);
    }
  }

  function onMapPress(pos: LatLng) {
    const p = { lat: pos.latitude, lng: pos.longitude };
    onCambio(p);
    reverseGeocode(p.lat, p.lng);
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#8B7B69" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar dirección, colonia, calle…"
          placeholderTextColor="#A89784"
          onSubmitEditing={buscarDireccion}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color="#8B7B69" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={buscarDireccion} disabled={buscando || !query.trim()} style={styles.searchButton}>
          {buscando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchButtonText}>Buscar</Text>}
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={[styles.mapWrap, { height: altura }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          region={region}
          onPress={(e) => onMapPress(e.nativeEvent.coordinate)}
        >
          {valor && (
            <Marker
              coordinate={{ latitude: valor.lat, longitude: valor.lng }}
              draggable
              onDragEnd={(e) => onMapPress(e.nativeEvent.coordinate)}
              pinColor={Platform.OS === "ios" ? "#FF7A2B" : undefined}
            />
          )}
        </MapView>

        <TouchableOpacity style={styles.miUbicacion} onPress={miUbicacion} disabled={obteniendo}>
          {obteniendo ? (
            <ActivityIndicator size="small" color="#FF7A2B" />
          ) : (
            <>
              <Ionicons name="locate" size={16} color="#FF7A2B" />
              <Text style={styles.miUbicacionText}>Mi ubicación</Text>
            </>
          )}
        </TouchableOpacity>

        {!valor && (
          <View style={styles.hint}>
            <Ionicons name="hand-left-outline" size={14} color="#1F2937" />
            <Text style={styles.hintText}>Busca o toca el mapa para marcar el punto</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, color: "#1F2937" },
  searchButton: { backgroundColor: "#FF7A2B", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 64, alignItems: "center" },
  searchButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  mapWrap: { borderRadius: 12, overflow: "hidden", backgroundColor: "#E5E7EB" },
  miUbicacion: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4 },
  miUbicacionText: { fontSize: 12, color: "#FF7A2B", fontWeight: "700" },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, elevation: 2 },
  hintText: { fontSize: 11, color: "#1F2937", fontWeight: "500" },
});
