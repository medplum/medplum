#!/usr/bin/env bash

# Start test services (PostgreSQL and Redis) with memory-optimized configuration
# This uses tmpfs for PostgreSQL to eliminate disk I/O and speed up tests
#
# Usage:
#   ./scripts/start-test-services.sh        # Start services
#   ./scripts/start-test-services.sh stop   # Stop services
#   ./scripts/start-test-services.sh restart # Restart services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

case "${1:-start}" in
  start)
    echo "Starting test services with tmpfs-backed PostgreSQL..."
    docker-compose -f docker-compose.test.yml up -d

    echo "Waiting for PostgreSQL to be ready..."
    until docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U medplum; do
      sleep 1
    done

    echo "Test services are ready!"
    echo ""
    echo "PostgreSQL: localhost:5432 (user: medplum, password: medplum)"
    echo "Redis:      localhost:6379 (password: medplum)"
    echo ""
    echo "To run tests: npm test --workspace=packages/server"
    echo "To stop services: $0 stop"
    ;;
  stop)
    echo "Stopping test services..."
    docker-compose -f docker-compose.test.yml down
    echo "Test services stopped."
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    exit 1
    ;;
esac
