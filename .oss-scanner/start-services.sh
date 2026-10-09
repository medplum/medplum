#!/usr/bin/env bash
# Starts the local Postgres and Redis that the Medplum server tests expect.
# Credentials match packages/server/medplum.config.json and docker-compose.yml.
# Safe to run more than once.

set -euo pipefail

PG_VERSION=$(ls /etc/postgresql | sort -V | tail -n 1)

if ! pg_isready -q -h localhost -p 5432; then
  pg_ctlcluster "$PG_VERSION" main start
fi

if ! redis-cli --no-auth-warning -a medplum ping >/dev/null 2>&1; then
  redis-server --requirepass medplum --daemonize yes --save '' --appendonly no --dir /tmp
fi

for _ in $(seq 1 30); do
  if pg_isready -q -h localhost -p 5432 && redis-cli --no-auth-warning -a medplum ping >/dev/null 2>&1; then
    echo "Postgres and Redis are ready"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for Postgres and Redis" >&2
exit 1
