import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

interface Props {
  /** Posición actual del repartidor (última GPS reportada). */
  repartidor: { lat: number; lng: number };
  /** Punto de entrega del cliente. */
  cliente: { lat: number; lng: number };
  altura?: number;
}

const MAPBOX_TOKEN =
  "pk.eyJ1IjoiamFkaGFzZnVoIiwiYSI6ImNtb2J6MXR5MTA1cmEyeHB6NWExMDA1bTAifQ.F28tnTfIXW7AcbsnY_u5BQ";

/**
 * Mini-mapa read-only para que el cliente vea dónde está el repartidor
 * en relación a su domicilio. Reusa el patrón de MapaUbicacion (Leaflet
 * dentro de WebView) pero sin interacción — no se mueve el pin, no se
 * cambia el centro, solo es visual.
 *
 * Dibuja:
 *  - Pin verde 🛵 en la última posición conocida del repartidor
 *  - Pin rojo 📍 en el punto de entrega
 *  - Línea recta dasheada entre los dos puntos (no llamamos a OSRM
 *    para no contaminar el viaje real con trazo aproximado; el cliente
 *    solo necesita una idea de dirección y distancia)
 */
function buildHtml(rep: { lat: number; lng: number }, cli: { lat: number; lng: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#E5E7EB; }
  .leaflet-control-attribution { font-size: 8px; }
  .pin { font-size: 24px; text-align: center; line-height: 1; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var TOKEN = ${JSON.stringify(MAPBOX_TOKEN)};
  var REP = [${rep.lat}, ${rep.lng}];
  var CLI = [${cli.lat}, ${cli.lng}];
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView(REP, 14);
  L.tileLayer(
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=' + TOKEN,
    { tileSize: 512, zoomOffset: -1, maxZoom: 18 }
  ).addTo(map);
  L.marker(REP, {
    icon: L.divIcon({ html: '<div class="pin">🛵</div>', iconSize: [28, 28], iconAnchor: [14, 14], className: '' }),
  }).addTo(map);
  L.marker(CLI, {
    icon: L.divIcon({ html: '<div class="pin">📍</div>', iconSize: [28, 28], iconAnchor: [14, 28], className: '' }),
  }).addTo(map);
  L.polyline([REP, CLI], { color: '#2563EB', weight: 3, opacity: 0.7, dashArray: '6, 6' }).addTo(map);
  map.fitBounds(L.latLngBounds([REP, CLI]), { padding: [30, 30], maxZoom: 16 });
</script>
</body>
</html>`;
}

export default function MapaTrackingClienteRN({ repartidor, cliente, altura = 180 }: Props) {
  // Recalcular HTML solo cuando las coords cambian — evita reload del
  // WebView en cada re-render del padre.
  const html = useMemo(() => buildHtml(repartidor, cliente), [
    repartidor.lat, repartidor.lng, cliente.lat, cliente.lng,
  ]);

  return (
    <View style={[styles.wrap, { height: altura }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        scalesPageToFit={false}
        javaScriptEnabled
        domStorageEnabled
        // El gesto en el mapa no debe propagarse al ScrollView padre,
        // pero como es read-only no necesitamos pan ni zoom.
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 10, overflow: "hidden", backgroundColor: "#E5E7EB", marginTop: 8 },
  web: { flex: 1 },
});
