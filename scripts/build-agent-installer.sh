#!/usr/bin/env bash

# Agent Installer build script

# References:
# https://docs.digicert.com/en/software-trust-manager/sign-with-digicert-signing-tools/sign-with-smctl.html
# https://docs.digicert.com/en/software-trust-manager/ci-cd-integrations/script-integrations/github-actions-integration-with-pkcs11.html
# https://docs.digicert.com/en/software-trust-manager/signing-tools/jsign.html
# https://ebourg.github.io/jsign/
# https://github.com/ebourg/jsign

# Pre-requisites

if ! command -v java >/dev/null 2>&1; then
    echo "Java required"
    exit 1
fi

if ! command -v makensis >/dev/null 2>&1; then
    echo "makensis required"
    exit 1
fi

if ! command -v wget >/dev/null 2>&1; then
    echo "wget required"
    exit 1
fi

if [[ -z "${SM_HOST}" ]]; then
  echo "DigiCert SM_HOST is missing"
  exit 1
fi

if [[ -z "${SM_API_KEY}" ]]; then
  echo "DigiCert SM_API_KEY is missing"
  exit 1
fi

if [[ -z "${SM_CLIENT_CERT_FILE_BASE64}" ]]; then
  echo "DigiCert SM_CLIENT_CERT_FILE_BASE64 is missing"
  exit 1
fi

if [[ -z "${SM_CLIENT_CERT_PASSWORD}" ]]; then
  echo "DigiCert SM_CLIENT_CERT_PASSWORD is missing"
  exit 1
fi

if [[ -z "${SM_CERT_ALIAS}" ]]; then
  echo "DigiCert SM_CERT_ALIAS is missing"
  exit 1
fi

# Fail on error
set -e

# Diagnostics
java --version

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")

# Move into packages/agent
pushd packages/agent

# Build the agent
npm run build

# Build the executable
npx pkg ./dist/cjs/index.cjs --targets node18-win-x64 --output "dist/medplum-agent-$MEDPLUM_VERSION-win64.exe" --options no-warnings

# Download JSign
if [ ! -f "jsign-5.0.jar" ]; then
    wget https://github.com/ebourg/jsign/releases/download/5.0/jsign-5.0.jar
fi

# Unpack the client certificate
echo "$SM_CLIENT_CERT_FILE_BASE64" | base64 --decode > Certificate_pkcs12.p12
SM_CLIENT_CERT_FILE="$(pwd)/Certificate_pkcs12.p12"

# Sign the executable
java -jar jsign-5.0.jar \
  --storetype DIGICERTONE \
  --storepass "$SM_API_KEY|$SM_CLIENT_CERT_FILE|$SM_CLIENT_CERT_PASSWORD" \
  --alias "$SM_CERT_ALIAS" \
  "dist/medplum-agent-$MEDPLUM_VERSION-win64.exe"

# Copy Shawl
cp ../../node_modules/node-shawl/bin/shawl-v1.3.0-legal.txt dist
cp ../../node_modules/node-shawl/bin/shawl-v1.3.0-win64.exe dist

# Sign the Shawl executable
java -jar jsign-5.0.jar \
  --storetype DIGICERTONE \
  --storepass "$SM_API_KEY|$SM_CLIENT_CERT_FILE|$SM_CLIENT_CERT_PASSWORD" \
  --alias "$SM_CERT_ALIAS" \
  dist/shawl-v1.3.0-win64.exe

# Build the installer
makensis -V4 -DARCH=x86_64 installer.nsi

# Check the build output
ls -la "medplum-agent-installer-$MEDPLUM_VERSION.exe"

# Sign the installer
java -jar jsign-5.0.jar \
  --storetype DIGICERTONE \
  --storepass "$SM_API_KEY|$SM_CLIENT_CERT_FILE|$SM_CLIENT_CERT_PASSWORD" \
  --alias "$SM_CERT_ALIAS" \
  "medplum-agent-installer-$MEDPLUM_VERSION.exe"

# Move back to root
popd
