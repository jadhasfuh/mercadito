#!/usr/bin/env bash
# Levanta un entorno de pruebas DESECHABLE: un Postgres propio en un puerto
# aparte y el servidor de Next apuntando a él.
#
# Nunca toca la base real: el clúster vive en un directorio temporal y se borra
# al terminar. Correr pruebas de dinero (cortes de caja, ventas) contra la base
# de producción no es una opción.
#
#   ./pruebas/entorno.sh arrancar   → levanta DB + servidor
#   ./pruebas/entorno.sh apagar     → apaga y borra todo
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/Cellar/postgresql@16/16.15/bin}"
PG_PUERTO="${PG_PUERTO:-55432}"
APP_PUERTO="${APP_PUERTO:-3199}"
TMP="${TMPDIR:-/tmp}/mercadito-pruebas"
export PATH="$PG_BIN:$PATH"

DB_URL="postgresql://postgres@127.0.0.1:${PG_PUERTO}/mercadito_test"

arrancar() {
  mkdir -p "$TMP"
  if ! pg_isready -h 127.0.0.1 -p "$PG_PUERTO" >/dev/null 2>&1; then
    rm -rf "$TMP/pgdata"
    initdb -D "$TMP/pgdata" -U postgres --auth=trust >/dev/null
    # Sin sockets unix: la ruta del temporal supera los 103 bytes que permite
    # Postgres para el socket y el arranque falla con un error poco obvio.
    pg_ctl -D "$TMP/pgdata" \
      -o "-p $PG_PUERTO -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
      -l "$TMP/pg.log" start >/dev/null
    sleep 2
    createdb -h 127.0.0.1 -p "$PG_PUERTO" -U postgres mercadito_test
  fi
  echo "postgres listo en $PG_PUERTO"

  DATABASE_URL="$DB_URL" nohup npx next dev -p "$APP_PUERTO" > "$TMP/dev.log" 2>&1 &
  # La primera request dispara initDb(): ahí corren todas las migraciones.
  for _ in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null "http://127.0.0.1:$APP_PUERTO/api/health"; then break; fi
  done
  echo "servidor listo en $APP_PUERTO"
}

apagar() {
  pkill -f "next dev -p $APP_PUERTO" 2>/dev/null || true
  pg_ctl -D "$TMP/pgdata" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP"
  echo "entorno de pruebas borrado"
}

case "${1:-arrancar}" in
  arrancar) arrancar ;;
  apagar)   apagar ;;
  *) echo "uso: $0 [arrancar|apagar]"; exit 1 ;;
esac
