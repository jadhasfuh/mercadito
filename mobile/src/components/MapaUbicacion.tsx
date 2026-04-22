import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import MapView, { Marker, type LatLng } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  valor: { lat: number; lng: number } | null;
  onCambio: (pos: { lat: number; lng: number }) => void;
  onDireccionDetectada?: (direccion: string) => void;
  altura?: number;
}

// Sahuayo centro como fallback si no hay ubicación previa
const DEFAULT_POS = { lat: 20.0463867, lng: -102.7229156 };

export default function MapaUbicacion({ valor, onCambio, onDireccionDetectada, altura = 240 }: Props) {
  const [obteniendo, setObteniendo] = useState(false);
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: valor?.lat ?? DEFAULT_POS.lat,
    longitude: valor?.lng ?? DEFAULT_POS.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  useEffect(() => {
    if (valor) {
      setRegion((r) => ({ ...r, latitude: valor.lat, longitude: valor.lng }));
    }
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
      // ignora
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
      mapRef.current?.animateToRegion(
        { latitude: p.lat, longitude: p.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        400
      );
      await reverseGeocode(p.lat, p.lng);
    } catch (e) {
      Alert.alert("Error", "No se pudo obtener tu ubicación");
      console.warn(e);
    } finally {
      setObteniendo(false);
    }
  }

  function onMapPress(pos: LatLng) {
    const p = { lat: pos.latitude, lng: pos.longitude };
    onCambio(p);
    reverseGeocode(p.lat, p.lng);
  }

  return (
    <View style={[styles.wrapper, { height: altura }]}>
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
          <Text style={styles.hintText}>Toca el mapa para marcar tu tienda</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 12, overflow: "hidden", backgroundColor: "#E5E7EB" },
  miUbicacion: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4 },
  miUbicacionText: { fontSize: 12, color: "#FF7A2B", fontWeight: "700" },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, elevation: 2 },
  hintText: { fontSize: 11, color: "#1F2937", fontWeight: "500" },
});
