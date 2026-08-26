#!/bin/bash
# Convierte capturas de simulador al tamaño que pide App Store Connect en el
# slot de 6.5" (1284 × 2778).
#
# Por qué hace falta: los simuladores modernos (iPhone 16/17 Pro Max) dan
# 1320 × 2868, que es 6.9". Ese tamaño solo lo acepta el slot de 6.9" — en el
# de 6.5" Apple lo rechaza por dimensiones.
#
# Cómo lo convierte: escala a lo ancho y recorta ~12 px de alto centrado. Las
# proporciones son casi idénticas (0.4603 vs 0.4622), así que el recorte es
# imperceptible y NO deforma la imagen.
#
# Uso:  ./scripts/capturas-appstore.sh ~/Desktop ~/Desktop/appstore-65
# No toca los originales: escribe copias en la carpeta de salida.

set -e
ORIGEN="${1:-$HOME/Desktop}"
DESTINO="${2:-$HOME/Desktop/appstore-65}"
ANCHO=1284
ALTO=2778

mkdir -p "$DESTINO"
n=0
shopt -s nullglob nocaseglob
for f in "$ORIGEN"/*.png; do
  base="$(basename "$f")"
  salida="$DESTINO/$base"
  cp "$f" "$salida"
  # 1) escalar proporcionalmente al ancho objetivo
  sips --resampleWidth "$ANCHO" "$salida" >/dev/null
  # 2) recortar al alto objetivo, centrado (sips rellena si falta)
  sips -c "$ALTO" "$ANCHO" "$salida" >/dev/null
  dim=$(sips -g pixelWidth -g pixelHeight "$salida" | awk '/pixel/{printf "%s ", $2}')
  echo "  ✓ $base → $dim"
  n=$((n+1))
done

if [ "$n" -eq 0 ]; then
  echo "No encontré PNGs en $ORIGEN"
  exit 1
fi
echo ""
echo "$n captura(s) en: $DESTINO"
echo "Súbelas al slot de 6.5\" en App Store Connect."
