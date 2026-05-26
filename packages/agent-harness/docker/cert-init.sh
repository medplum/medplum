#!/bin/sh
# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# One-shot cert generator for the agent-harness Docker stack.
#
# On first run, mints:
#   - $CERT_DIR/ca.key, $CERT_DIR/ca.crt  -- ephemeral root CA
#   - $CERT_DIR/server.key, $CERT_DIR/server.crt  -- server cert signed by the CA,
#     with SANs covering the docker-network alias (meta.medplum.com),
#     the service hostname (mock-releases), and loopback.
#
# Re-running is a no-op. Delete $CERT_DIR/ca.crt to force a fresh CA.
#
# Used inside docker-compose as a one-shot `cert-init` service; mock-releases
# mounts $CERT_DIR/server.{crt,key}, and harness mounts $CERT_DIR/ca.crt via
# NODE_EXTRA_CA_CERTS so spawned agent child processes trust the impersonated
# https://meta.medplum.com.
set -eu

CERT_DIR="${CERT_DIR:-/certs}"
CN_HOST="${CN_HOST:-meta.medplum.com}"
ALT_NAMES="${ALT_NAMES:-DNS:meta.medplum.com,DNS:mock-releases,DNS:localhost,IP:127.0.0.1}"
DAYS="${DAYS:-365}"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/ca.crt" ] && [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
  echo "cert-init: existing CA + server cert found in $CERT_DIR -- skipping"
  exit 0
fi

echo "cert-init: generating ephemeral CA + server cert in $CERT_DIR"

# Root CA
openssl genrsa -out "$CERT_DIR/ca.key" 2048
openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha256 -days "$DAYS" \
  -subj "/CN=Medplum Agent Harness Dev CA" \
  -out "$CERT_DIR/ca.crt"

# Server cert
openssl genrsa -out "$CERT_DIR/server.key" 2048
openssl req -new -key "$CERT_DIR/server.key" \
  -subj "/CN=${CN_HOST}" \
  -out "$CERT_DIR/server.csr"

cat > "$CERT_DIR/server.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${ALT_NAMES}
EOF

openssl x509 -req -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/server.crt" -days "$DAYS" -sha256 -extfile "$CERT_DIR/server.ext"

# Loose perms so the non-root harness/mock-releases users can read.
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/server.crt"
chmod 640 "$CERT_DIR/server.key" "$CERT_DIR/ca.key" 2>/dev/null || true

echo "cert-init: done"
openssl x509 -in "$CERT_DIR/server.crt" -noout -subject -issuer -dates
