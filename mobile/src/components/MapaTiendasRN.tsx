import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

interface TiendaMarker {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  abierto?: boolean;
}

interface Props {
  tiendas: TiendaMarker[];
  onTiendaPress: (id: string) => void;
  selectedId?: string | null;
  altura?: number;
}

// Mismo token público Mapbox que MapaUbicacion / src/lib/envio.ts.
const MAPBOX_TOKEN =
  "pk.eyJ1IjoiamFkaGFzZnVoIiwiYSI6ImNtb2J6MXR5MTA1cmEyeHB6NWExMDA1bTAifQ.F28tnTfIXW7AcbsnY_u5BQ";

/**
 * Mapa de ubicaciones de tiendas dentro de un WebView (Leaflet + tiles
 * Mapbox), equivalente nativo de `MapaTiendasAdmin` de la web. Un pin 🏪
 * por tienda; tocar un pin filtra por esa tienda.
 *
 * Comunicación con RN:
 *  - HTML → RN: postMessage { type: 'mapReady' } | { type: 'tiendaSelected', id }
 *  - RN → HTML: window.__rnSelect(id) — resalta la tienda seleccionada sin
 *    recrear el mapa.
 */
function buildHtml(tiendas: TiendaMarker[]): string {
  const tiendasJson = JSON.stringify(tiendas);
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
  var TIENDAS = ${tiendasJson};
  var SEL = null;
  var markers = {};

  function send(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  var first = TIENDAS[0] || { lat: 20.0463867, lng: -102.7229156 };
  var map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView([first.lat, first.lng], 14);
  L.tileLayer(
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=' + TOKEN,
    { tileSize: 512, zoomOffset: -1, maxZoom: 19 }
  ).addTo(map);

  function iconFor(t, isSel) {
    var size = isSel ? 38 : 30;
    var fs = isSel ? 32 : 24;
    var filt = isSel
      ? 'drop-shadow(0 0 6px #ED8E3C)'
      : (t.abierto === false ? 'grayscale(1) opacity(0.55)' : 'none');
    return L.divIcon({
      html: '<div style="font-size:' + fs + 'px;line-height:1;text-align:center;filter:' + filt + ';">🏪</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      className: ''
    });
  }

  var bounds = L.latLngBounds([]);
  TIENDAS.forEach(function(t) {
    var m = L.marker([t.lat, t.lng], { icon: iconFor(t, false) }).addTo(map);
    if (t.nombre) m.bindTooltip(t.nombre, { direction: 'top', offset: [0, -28] });
    m.on('click', function() { send({ type: 'tiendaSelected', id: t.id }); });
    markers[t.id] = m;
    bounds.extend([t.lat, t.lng]);
  });
  if (TIENDAS.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }

  // RN nos dice cuál está seleccionada — re-estilamos sin recrear el mapa.
  window.__rnSelect = function(id) {
    SEL = id;
    TIENDAS.forEach(function(t) {
      var m = markers[t.id];
      if (m) m.setIcon(iconFor(t, t.id === id));
    });
  };

  send({ type: 'mapReady' });
</script>
</body>
</html>`;
}

export default function MapaTiendasRN({ tiendas, onTiendaPress, selectedId, altura = 180 }: Props) {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Reconstruir el HTML solo cuando cambia el conjunto de tiendas (no en
  // cada cambio de selección — eso se hace por injectJavaScript). Las
  // tiendas llegan después del montaje (al elegir categoría), así que el
  // WebView se recarga cuando aparecen.
  const signature = tiendas.map((t) => `${t.id}:${t.lat}:${t.lng}:${t.abierto}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(tiendas), [signature]);

  // Aplicar la selección cuando cambia (mapa ya listo).
  useEffect(() => {
    if (!mapReady) return;
    webRef.current?.injectJavaScript(
      `window.__rnSelect(${JSON.stringify(selectedId ?? null)}); true;`
    );
  }, [selectedId, mapReady]);

  function handleMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "mapReady") {
        setMapReady(true);
        // Re-aplicar selección tras cada (re)carga del HTML.
        webRef.current?.injectJavaScript(
          `window.__rnSelect(${JSON.stringify(selectedRef.current ?? null)}); true;`
        );
      } else if (msg.type === "tiendaSelected" && typeof msg.id === "string") {
        onTiendaPress(msg.id);
      }
    } catch {
      // ignore malformed messages
    }
  }

  if (tiendas.length === 0) return null;

  return (
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
        // Sin estos dos, los gestos de pan/zoom los captura el ScrollView /
        // FlatList padre y no llegan a Leaflet (indispensable en Android).
        nestedScrollEnabled
        overScrollMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: 12, overflow: "hidden", backgroundColor: "#E5E7EB" },
});
