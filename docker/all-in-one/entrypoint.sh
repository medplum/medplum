#!/usr/bin/env bash

set -uo pipefail

DATA_DIR="${DATA_DIR:-/data}"

log() {
  printf '[all-in-one] %s\n' "$*"
}

PID_PG=""
PID_REDIS=""
PID_SERVER=""
PID_APP=""

export POSTGRES_USER="${POSTGRES_USER:-medplum}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-medplum}"
export POSTGRES_DB="${POSTGRES_DB:-$POSTGRES_USER}"
export PGDATA="${PGDATA:-$DATA_DIR/postgres}"

export MEDPLUM_PORT="${MEDPLUM_PORT:-8103}"
export MEDPLUM_BASE_URL="${MEDPLUM_BASE_URL:-http://localhost:8103/}"
export MEDPLUM_APP_BASE_URL="${MEDPLUM_APP_BASE_URL:-http://localhost:3000/}"
export MEDPLUM_STORAGE_BASE_URL="${MEDPLUM_STORAGE_BASE_URL:-http://localhost:8103/storage/}"

export MEDPLUM_DATABASE_HOST="${MEDPLUM_DATABASE_HOST:-127.0.0.1}"
export MEDPLUM_DATABASE_PORT="${MEDPLUM_DATABASE_PORT:-5432}"
export MEDPLUM_DATABASE_DBNAME="${MEDPLUM_DATABASE_DBNAME:-$POSTGRES_DB}"
export MEDPLUM_DATABASE_USERNAME="${MEDPLUM_DATABASE_USERNAME:-$POSTGRES_USER}"
export MEDPLUM_DATABASE_PASSWORD="${MEDPLUM_DATABASE_PASSWORD:-$POSTGRES_PASSWORD}"

export MEDPLUM_REDIS_HOST="${MEDPLUM_REDIS_HOST:-127.0.0.1}"
export MEDPLUM_REDIS_PORT="${MEDPLUM_REDIS_PORT:-6379}"
export MEDPLUM_REDIS_PASSWORD="${MEDPLUM_REDIS_PASSWORD:-${REDIS_PASSWORD:-medplum}}"

export MEDPLUM_BINARY_STORAGE="${MEDPLUM_BINARY_STORAGE:-file:$DATA_DIR/binary/}"
export MEDPLUM_ALLOWED_ORIGINS="${MEDPLUM_ALLOWED_ORIGINS:-*}"
export MEDPLUM_INTROSPECTION_ENABLED="${MEDPLUM_INTROSPECTION_ENABLED:-true}"
export MEDPLUM_VM_CONTEXT_BOTS_ENABLED="${MEDPLUM_VM_CONTEXT_BOTS_ENABLED:-true}"
export MEDPLUM_DEFAULT_BOT_RUNTIME_VERSION="${MEDPLUM_DEFAULT_BOT_RUNTIME_VERSION:-vmcontext}"
export MEDPLUM_SHUTDOWN_TIMEOUT_MILLISECONDS="${MEDPLUM_SHUTDOWN_TIMEOUT_MILLISECONDS:-30000}"

shutdown() {
  local status=$?
  trap - INT TERM EXIT

  log "Shutting down..."

  # Stop the web frontend first.
  if [ -n "$PID_APP" ] && kill -0 "$PID_APP" 2>/dev/null; then
    kill -TERM "$PID_APP" 2>/dev/null || true
  fi

  # Give Medplum the opportunity to perform its own graceful shutdown.
  # Medplum closes its workers, database connections, and Redis connections
  # as part of its shutdown lifecycle, so Redis must remain available until
  # the server has exited.
  if [ -n "$PID_SERVER" ] && kill -0 "$PID_SERVER" 2>/dev/null; then
    kill -TERM "$PID_SERVER" 2>/dev/null || true

    local elapsed=0
    while kill -0 "$PID_SERVER" 2>/dev/null; do
      if [ "$elapsed" -ge 35 ]; then
        log "Medplum server did not exit gracefully; forcing shutdown"
        kill -KILL "$PID_SERVER" 2>/dev/null || true
        break
      fi

      sleep 1
      elapsed=$((elapsed + 1))
    done
  fi

  # Medplum has now had an opportunity to close its Redis connections.
  if [ -n "$PID_REDIS" ] && kill -0 "$PID_REDIS" 2>/dev/null; then
    log "Stopping Redis..."
    kill -TERM "$PID_REDIS" 2>/dev/null || true
  fi

  # PostgreSQL is shut down last.
  if [ -n "$PID_PG" ] && kill -0 "$PID_PG" 2>/dev/null; then
    log "Stopping PostgreSQL..."
    kill -INT "$PID_PG" 2>/dev/null || true
  fi

  wait 2>/dev/null || true

  log "Shutdown complete"
  exit "$status"
}

trap shutdown INT TERM EXIT

wait_for() {
  local name="$1"
  local timeout="$2"
  local pid="$3"
  shift 3

  local elapsed=0

  while ! "$@" >/dev/null 2>&1; do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "$name exited during startup"
      return 1
    fi

    if [ "$elapsed" -ge "$timeout" ]; then
      log "Timed out waiting for $name"
      return 1
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  log "$name ready"
}

redis_ping() {
  [ "$(redis-cli \
    -h 127.0.0.1 \
    -p 6379 \
    -a "$MEDPLUM_REDIS_PASSWORD" \
    --no-auth-warning \
    ping 2>/dev/null)" = "PONG" ]
}

server_ok() {
  node -e '
    fetch("http://127.0.0.1:" + (process.env.MEDPLUM_PORT || 8103) + "/healthcheck")
      .then((response) => process.exit(response.ok ? 0 : 1))
      .catch(() => process.exit(1));
  '
}


# PostgreSQL
log "Starting PostgreSQL..."

mkdir -p "$DATA_DIR"

docker-entrypoint.sh postgres \
  -c listen_addresses=127.0.0.1 \
  -c statement_timeout=60000 \
  -c 'default_transaction_isolation=REPEATABLE READ' \
  -c shared_preload_libraries=pg_stat_statements,auto_explain &

PID_PG=$!

wait_for \
  "PostgreSQL" \
  120 \
  "$PID_PG" \
  pg_isready \
  -h 127.0.0.1 \
  -p 5432 \
  -U "$POSTGRES_USER" || exit 1


# Redis
log "Starting Redis..."

mkdir -p "$DATA_DIR/redis" "$DATA_DIR/binary"

chown redis:redis "$DATA_DIR/redis"

gosu redis redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --requirepass "$MEDPLUM_REDIS_PASSWORD" \
  --dir "$DATA_DIR/redis" &

PID_REDIS=$!

wait_for \
  "Redis" \
  30 \
  "$PID_REDIS" \
  redis_ping || exit 1


# Medplum server
log "Starting Medplum server..."

node \
  --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import ./packages/server/dist/otel/instrumentation.js \
  packages/server/dist/index.js \
  env &

PID_SERVER=$!

wait_for \
  "Medplum server" \
  300 \
  "$PID_SERVER" \
  server_ok || exit 1


# Web application
log "Starting Medplum app..."

sh /usr/local/bin/app-entrypoint.sh &

PID_APP=$!

log "All-in-one Medplum stack is ready"
log "Web app: http://localhost:3000"
log "API:     http://localhost:8103"


# Wait until a supervised service exits.
wait -n "$PID_PG" "$PID_REDIS" "$PID_SERVER" "$PID_APP"

status=$?

log "A supervised service exited with status $status"

exit "$status"