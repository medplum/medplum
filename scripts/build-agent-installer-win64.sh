#!/usr/bin/env bash

# Agent Installer build script

# Fail on error
set -e

# References:
# https://docs.digicert.com/en/software-trust-manager/sign-with-digicert-signing-tools/sign-with-smctl.html
# https://docs.digicert.com/en/software-trust-manager/ci-cd-integrations/script-integrations/github-actions-integration-with-pkcs11.html
# https://docs.digicert.com/en/software-trust-manager/signing-tools/jsign.html
# https://ebourg.github.io/jsign/
# https://github.com/ebourg/jsign

# Pre-requisites

if ! command -v makensis >/dev/null 2>&1; then
    echo "makensis required"
    exit 1
fi

if ! command -v wget >/dev/null 2>&1; then
    echo "wget required"
    exit 1
fi

# If we are skipping signing, none of the pre-reqs for signing are required
if [ -z "$SKIP_SIGNING" ]; then
  if ! command -v java >/dev/null 2>&1; then
      echo "Java required"
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

  # Diagnostics
  java --version
fi

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")
# Get full version, including the git shorthash, delimited by a '-'
export MEDPLUM_FULL_VERSION="$MEDPLUM_VERSION-$MEDPLUM_GIT_SHORTHASH"

# Move into packages/agent
pushd packages/agent

pushd ../..

# Build the executable
./scripts/build-agent-sea-win64.sh

popd

if [ -z "$SKIP_SIGNING" ]; then
  # Download JSign
  if [ ! -f "jsign-5.0.jar" ]; then
      wget https://github.com/ebourg/jsign/releases/download/5.0/jsign-5.0.jar
  fi

  # Unpack the client certificate
  export SM_CLIENT_CERT_FILE="Certificate_pkcs12.p12"
  echo "$SM_CLIENT_CERT_FILE_BASE64" | base64 --decode > "$SM_CLIENT_CERT_FILE"

  # Sign the executable
  java -jar jsign-5.0.jar \
    --storetype DIGICERTONE \
    --storepass "$SM_API_KEY|$SM_CLIENT_CERT_FILE|$SM_CLIENT_CERT_PASSWORD" \
    --alias "$SM_CERT_ALIAS" \
    "dist/medplum-agent-$MEDPLUM_FULL_VERSION-win64.exe"
fi

# Download Shawl exe
rm -f shawl-v1.5.0-win64.zip
wget https://github.com/mtkennerly/shawl/releases/download/v1.5.0/shawl-v1.5.0-win64.zip
unzip shawl-v1.5.0-win64.zip
mv shawl.exe dist/shawl-v1.5.0-win64.exe

# Download Shawl legal
rm -f shawl-v1.5.0-legal.zip
wget https://github.com/mtkennerly/shawl/releases/download/v1.5.0/shawl-v1.5.0-legal.zip
unzip shawl-v1.5.0-legal.zip
mv shawl-v1.5.0-legal.txt dist

if [ -z "$SKIP_SIGNING" ]; then
  # Sign the Shawl executable
  java -jar jsign-5.0.jar \
    --storetype DIGICERTONE \
    --storepass "$SM_API_KEY|$SM_CLIENT_CERT_FILE|$SM_CLIENT_CERT_PASSWORD" \
    --alias "$SM_CERT_ALIAS" \
    dist/shawl-v1.5.0-win64.exe
fi

# Build the installer
if [ -z "$SKIP_SIGNING" ]; then
  makensis -DSKIP_SIGNING installer.nsi # globally defines the SKIP_SIGNING symbol
else
  makensis installer.nsi
fi

# Generate the installer checksum
sha256sum "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe" > "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.sha256"

# Check the installer checksum
sha256sum --check "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.sha256"

if [ -z "$SKIP_SIGNING" ]; then
  # Generate a GPG signature for the installer
  # --batch = Use batch mode. Never ask, do not allow interactive commands.
  # --yes = Assume "yes" on most questions. Should not be used in an option file.
  # --pinentry-mode loopback = Allows the passphrase to be set via command line or fd.
  # --passphrase-fd 0 = Read the passphrase from file descriptor 0 (stdin).
  # --local-user = Specify the key to use for signing.
  # --detach-sign --armor = Create a detached ASCII armored signature.
  echo "$GPG_PASSPHRASE" | gpg \
    --batch \
    --yes \
    --pinentry-mode loopback \
    --passphrase-fd 0 \
    --local-user "$GPG_KEY_ID" \
    --detach-sign --armor \
    "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe"

  # Check the signature
  gpg --verify "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.asc"
fi

# Check the build output
ls -la

# Make sure binary runs
dist/medplum-agent-$MEDPLUM_FULL_VERSION-win64.exe --help

# Move back to root
popd
