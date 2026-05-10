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
  /** Marcadores 🏪 en el mapa (tiendas / punto de recogida). Si tiene
   *  elementos, además dibujamos la ruta desde cada origen al pin del
   *  cliente y hacemos fitBounds para enmarcar todo. Pintar la ruta
   *  imita el behavior de MapaEntrega de la web. */
  origenes?: Array<{ lat: number; lng: number; nombre?: string }>;
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
function buildHtml(initial: { lat: number; lng: number }, origenes: Array<{ lat: number; lng: number; nombre?: string }>): string {
  const origenesJson = JSON.stringify(origenes);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#E5E7EB; }
  .leaflet-control-attribution { font-size: 9px; }
  .pin-emoji { font-size: 28px; text-align: center; line-height: 1; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var TOKEN = ${JSON.stringify(MAPBOX_TOKEN)};
  var ORIGENES = ${origenesJson};
  var map = L.map('map', { zoomControl: false }).setView([${initial.lat}, ${initial.lng}], 15);
  L.tileLayer(
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=' + TOKEN,
    { tileSize: 512, zoomOffset: -1, maxZoom: 19, attribution: '&copy; Mapbox &copy; OpenStreetMap' }
  ).addTo(map);

  var marker = null;
  var routeLine = null;
  var origenMarkers = [];
  // Sequence counter: clicks rápidos disparan fetches paralelos. Sin esto,
  // varios addTo corren tarde y stackean polylines viejas en el mapa. Solo
  // el último fetch dibuja; los previos se descartan en el callback.
  var rutaSeq = 0;
  // fitBounds yankea zoom/pan en cada click. Solo la primera colocación
  // encuadra; después el usuario navega libre. __rnResetFit() lo resetea
  // cuando el usuario pide GPS explícitamente.
  var hasFitted = false;

  function send(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  // Markers de origen (tiendas / recogida).
  ORIGENES.forEach(function(o, i) {
    var icon = L.divIcon({
      html: '<div class="pin-emoji">🏪</div>',
      iconSize: [32, 32], iconAnchor: [16, 16], className: ''
    });
    var m = L.marker([o.lat, o.lng], { icon: icon }).addTo(map);
    if (o.nombre) m.bindPopup('<b>' + o.nombre + '</b>');
    origenMarkers.push(m);
  });

  function dibujarRuta(destLat, destLng) {
    if (ORIGENES.length === 0) return;
    var seq = ++rutaSeq;
    if (routeLine) { routeLine.remove(); routeLine = null; }
    // Mapbox Directions (mismo proveedor que la web). Antes usábamos OSRM
    // público pero se caía con frecuencia y caíamos al fallback diagonal.
    var coords = ORIGENES.map(function(o) { return o.lng + ',' + o.lat; })
      .concat([destLng + ',' + destLat]).join(';');
    var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' + coords +
      '?overview=full&geometries=geojson&access_token=' + TOKEN;
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (seq !== rutaSeq) return;
        if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error('sin ruta');
        if (routeLine) { routeLine.remove(); routeLine = null; }
        var line = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
        routeLine = L.polyline(line, { color: '#059669', weight: 4, opacity: 0.85 }).addTo(map);
        if (!hasFitted) {
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
          hasFitted = true;
        }
      })
      .catch(function() {
        if (seq !== rutaSeq) return;
        if (routeLine) { routeLine.remove(); routeLine = null; }
        // Fallback: línea recta amber dasheada (igual que web cuando Mapbox falla).
        var line = ORIGENES.map(function(o) { return [o.lat, o.lng]; }).concat([[destLat, destLng]]);
        routeLine = L.polyline(line, { color: '#F59E0B', weight: 3, opacity: 0.6, dashArray: '8, 6' }).addTo(map);
        if (!hasFitted) {
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
          hasFitted = true;
        }
      });
  }

  function setMarker(lat, lng, emit) {
    var icon = L.divIcon({
      html: '<div class="pin-emoji">📍</div>',
      iconSize: [36, 36], iconAnchor: [18, 36], className: ''
    });
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng], { icon: icon, draggable: true })
      .addTo(map)
      .on('dragend', function(e) {
        var p = e.target.getLatLng();
        send({ type: 'pointSelected', lat: p.lat, lng: p.lng });
        dibujarRuta(p.lat, p.lng);
      });
    if (emit) send({ type: 'pointSelected', lat: lat, lng: lng });
    dibujarRuta(lat, lng);
  }

  map.on('click', function(e) {
    setMarker(e.latlng.lat, e.latlng.lng, true);
  });

  window.__rnSetCenter = function(lat, lng) { map.setView([lat, lng], 16); };
  window.__rnSetMarker = function(lat, lng) {
    setMarker(lat, lng, false);
  };
  window.__rnResetFit = function() { hasFitted = false; };

  // Si solo hay origenes (aún no hay pin del cliente), centramos el mapa
  // en ellos para que se vean al abrir.
  if (ORIGENES.length > 0) {
    var bounds = L.latLngBounds(ORIGENES.map(function(o) { return [o.lat, o.lng]; }));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }

  send({ type: 'mapReady' });
</script>
</body>
</html>`;
}

export default function MapaUbicacion({ valor, onCambio, onDireccionDetectada, altura = 260, origenes = [] }: Props) {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [obteniendo, setObteniendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");

  // Construimos el HTML una sola vez con la posición inicial. Cambios
  // posteriores de `valor` se empujan por injectJavaScript.
  // El HTML se construye una sola vez con origenes congelados al montarse.
  // Si origenes cambian dinámicamente el mapa no se redibuja — para los
  // casos de uso actuales (checkout y enviar-paquete) los origenes están
  // fijos cuando se monta el componente, así que está bien.
  const [html] = useState(() => buildHtml(valor ?? DEFAULT_POS, origenes));

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
      // Acción explícita del usuario: reencuadrar al usar GPS.
      webRef.current?.injectJavaScript(
        `window.__rnResetFit(); window.__rnSetMarker(${p.lat}, ${p.lng}); true;`
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
        // Búsqueda explícita: reencuadrar para mostrar el resultado.
        webRef.current?.injectJavaScript(
          `window.__rnResetFit(); window.__rnSetMarker(${p.lat}, ${p.lng}); true;`
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
          placeholder="Buscar dirección"
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
          // Sin estos dos, los gestos de pan/zoom dentro del WebView son
          // capturados por el ScrollView padre y no llegan a Leaflet.
          // En Android RN es indispensable.
          nestedScrollEnabled
          overScrollMode="never"
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
});
