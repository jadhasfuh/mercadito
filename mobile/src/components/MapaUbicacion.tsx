import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Keyboard } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  valor: { lat: number; lng: number } | null;
  onCambio: (pos: { lat: number; lng: number }) => void;
  onDireccionDetectada?: (direccion: string) => void;
  altura?: number;
}

// Sahuayo centro como fallback.
const DEFAULT_POS = { lat: 20.0463867, lng: -102.7229156 };

// Token público Mapbox (el mismo de src/lib/envio.ts). `pk.*` está diseñado
// para exponerse al cliente; la cuota es por cuenta, no por origen.
const MAPBOX_TOKEN =
  "pk.eyJ1IjoiamFkaGFzZnVoIiwiYSI6ImNtb2J6MXR5MTA1cmEyeHB6NWExMDA1bTAifQ.F28tnTfIXW7AcbsnY_u5BQ";

/**
 * HTML que corre dentro del WebView. Leaflet + tiles de Mapbox Streets.
 * Comunicación con RN:
 *  - RN → HTML: window.__rnSetCenter(lat, lng), window.__rnSetMarker(lat, lng)
 *  - HTML → RN: postMessage(JSON) con { type: 'mapReady' | 'pointSelected',
 *    lat, lng }.
 * El WebView está aislado; nada sale del token + tiles Mapbox.
 */
function buildHtml(initial: { lat: number; lng: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#E5E7EB; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var TOKEN = ${JSON.stringify(MAPBOX_TOKEN)};
  var map = L.map('map', { zoomControl: false }).setView([${initial.lat}, ${initial.lng}], 15);
  L.tileLayer(
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=' + TOKEN,
    {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
      attribution: '&copy; Mapbox &copy; OpenStreetMap',
    }
  ).addTo(map);

  var marker = null;
  function send(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }
  function setMarker(lat, lng, emit) {
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng], { draggable: true })
      .addTo(map)
      .on('dragend', function(e) {
        var p = e.target.getLatLng();
        send({ type: 'pointSelected', lat: p.lat, lng: p.lng });
      });
    if (emit) send({ type: 'pointSelected', lat: lat, lng: lng });
  }
  map.on('click', function(e) {
    setMarker(e.latlng.lat, e.latlng.lng, true);
  });

  // Pin inicial si recibimos uno del padre RN.
  window.__rnSetCenter = function(lat, lng) {
    map.setView([lat, lng], 16);
  };
  window.__rnSetMarker = function(lat, lng) {
    setMarker(lat, lng, false);
    map.setView([lat, lng], 16);
  };

  // Si nos pasan posición inicial válida, marcamos sin emitir (el valor ya
  // lo conoce RN por los props; evitamos un round-trip innecesario).
  ${
    /* null-check lo hace el caller; aquí asumimos valores numéricos válidos */ ""
  }
  send({ type: 'mapReady' });
</script>
</body>
</html>`;
}

export default function MapaUbicacion({ valor, onCambio, onDireccionDetectada, altura = 260 }: Props) {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [obteniendo, setObteniendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");

  // Construimos el HTML una sola vez con la posición inicial. Cambios
  // posteriores de `valor` se empujan por injectJavaScript.
  const [html] = useState(() => buildHtml(valor ?? DEFAULT_POS));

  // Al tener mapa listo + valor, pintamos el marker inicial.
  useEffect(() => {
    if (!mapReady) return;
    if (valor) {
      webRef.current?.injectJavaScript(
        `window.__rnSetMarker(${valor.lat}, ${valor.lng}); true;`
      );
    }
  }, [mapReady, valor]);

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

  function handleMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "mapReady") {
        setMapReady(true);
      } else if (msg.type === "pointSelected" && typeof msg.lat === "number" && typeof msg.lng === "number") {
        onCambio({ lat: msg.lat, lng: msg.lng });
        reverseGeocode(msg.lat, msg.lng);
      }
    } catch {
      // ignore malformed messages
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
      webRef.current?.injectJavaScript(
        `window.__rnSetMarker(${p.lat}, ${p.lng}); true;`
      );
      reverseGeocode(p.lat, p.lng);
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
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=mx&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "Mercadito/1.0" }, signal: ctrl.signal }
      ).finally(() => clearTimeout(t));
      const data = await res.json();
      if (data?.[0]) {
        const p = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        onCambio(p);
        webRef.current?.injectJavaScript(
          `window.__rnSetMarker(${p.lat}, ${p.lng}); true;`
        );
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

  return (
    <View style={styles.container}>
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

      <View style={[styles.mapWrap, { height: altura }]}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://mercadito.cx/" }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          style={StyleSheet.absoluteFillObject}
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
          mixedContentMode="always"
        />

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
