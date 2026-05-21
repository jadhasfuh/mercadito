#!/usr/bin/env bash
# migrar.sh — empaqueta / restaura los archivos SECRETO (gitignored) de
# Mercadito para mover el proyecto a otra computadora.
#
# El script NO contiene secretos: solo recolecta los archivos y los cifra con
# una passphrase (gpg simétrico, AES-256). En la máquina nueva necesitas gpg.
#
# Uso:
#   ./migrar.sh pack                  → crea mercadito-secretos-FECHA.tar.gz.gpg
#   ./migrar.sh unpack <archivo.gpg>  → restaura cada archivo en su lugar
#
# Flujo típico:
#   1) En la compu vieja:  ./migrar.sh pack   (te pide una passphrase)
#   2) Pasa el .gpg + este script + el repo clonado a la compu nueva (USB/cifrado)
#   3) En la compu nueva (dentro del repo):  ./migrar.sh unpack mercadito-secretos-*.gpg

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$HOME/.ssh/id_ed25519"

# Archivos secreto, relativos a la raíz del repo. La llave SSH se maneja aparte
# porque vive en ~/.ssh (fuera del repo).
FILES_REPO=(
  "CONTEXTO-PRIVADO.md"
  "mobile/google-services.json"
  "mobile/clave.json"
  "mobile/@jadhasfuh__mercadito.jks"
  "builds/keystore-backup-2026-05.txt"
)

die() { echo "❌ $*" >&2; exit 1; }
command -v gpg >/dev/null || die "gpg no está instalado (sudo apt install gnupg)"

# ───────────────────────────── pack ─────────────────────────────
pack() {
  local stamp out stage
  stamp="$(date +%Y-%m-%d)"
  out="$REPO_DIR/mercadito-secretos-$stamp.tar.gz.gpg"
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT

  echo ">> Recolectando archivos secreto..."
  local incluidos=0
  for rel in "${FILES_REPO[@]}"; do
    if [ -e "$REPO_DIR/$rel" ]; then
      mkdir -p "$stage/repo/$(dirname "$rel")"
      cp "$REPO_DIR/$rel" "$stage/repo/$rel"
      echo "   ✓ $rel"
      incluidos=$((incluidos+1))
    else
      echo "   ⚠️  falta (se omite): $rel"
    fi
  done

  # Llave SSH (privada + pública)
  if [ -e "$SSH_KEY" ]; then
    mkdir -p "$stage/ssh"
    cp "$SSH_KEY" "$stage/ssh/id_ed25519"
    [ -e "$SSH_KEY.pub" ] && cp "$SSH_KEY.pub" "$stage/ssh/id_ed25519.pub"
    echo "   ✓ ~/.ssh/id_ed25519 (+ .pub)"
    incluidos=$((incluidos+1))
  else
    echo "   ⚠️  falta (se omite): ~/.ssh/id_ed25519"
  fi

  [ "$incluidos" -gt 0 ] || die "No se encontró ningún archivo para empaquetar."

  echo ">> Cifrando ($incluidos archivos)... elige una passphrase (la pedirás al desempacar)"
  tar -czf - -C "$stage" . | gpg --symmetric --cipher-algo AES256 --output "$out"

  chmod 600 "$out"
  echo ""
  echo "✅ Listo: $out"
  echo "   Pásalo a la otra compu por un medio seguro (USB cifrado / no por chat público)."
  echo "   Allá:  ./migrar.sh unpack $(basename "$out")"
}

# ──────────────────────────── unpack ────────────────────────────
unpack() {
  local enc="${1:-}"
  [ -n "$enc" ] || die "Falta el archivo. Uso: ./migrar.sh unpack <archivo.gpg>"
  [ -e "$enc" ] || die "No existe: $enc"
  local stage
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT

  echo ">> Descifrando (te pedirá la passphrase)..."
  gpg --decrypt "$enc" | tar -xzf - -C "$stage"

  echo ">> Restaurando archivos del repo en $REPO_DIR ..."
  if [ -d "$stage/repo" ]; then
    for rel in "${FILES_REPO[@]}"; do
      if [ -e "$stage/repo/$rel" ]; then
        mkdir -p "$REPO_DIR/$(dirname "$rel")"
        cp "$stage/repo/$rel" "$REPO_DIR/$rel"
        echo "   ✓ $rel"
      fi
    done
  fi

  # Llave SSH — confirmar antes de sobreescribir
  if [ -e "$stage/ssh/id_ed25519" ]; then
    mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
    if [ -e "$SSH_KEY" ]; then
      read -r -p "   Ya existe ~/.ssh/id_ed25519. ¿Sobreescribir? [y/N] " resp
      resp="$(printf '%s' "$resp" | tr 'A-Z' 'a-z')"
      [ "$resp" = "y" ] || { echo "   (saltada la llave SSH)"; resp="n"; }
    else
      resp="y"
    fi
    if [ "$resp" = "y" ]; then
      cp "$stage/ssh/id_ed25519" "$SSH_KEY"; chmod 600 "$SSH_KEY"
      [ -e "$stage/ssh/id_ed25519.pub" ] && { cp "$stage/ssh/id_ed25519.pub" "$SSH_KEY.pub"; chmod 644 "$SSH_KEY.pub"; }
      echo "   ✓ ~/.ssh/id_ed25519 (+ .pub)"
    fi
  fi

  echo ""
  echo "✅ Restaurado. Verifica el acceso al VPS:"
  echo "     ssh root@157.173.199.130 \"echo ok\""
  echo "   Y el login de EAS:  cd mobile && eas whoami   (si no, 'eas login')"
}

case "${1:-}" in
  pack)   pack ;;
  unpack) unpack "${2:-}" ;;
  *) echo "Uso: ./migrar.sh pack | unpack <archivo.gpg>"; exit 1 ;;
esac
