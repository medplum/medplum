#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Check if dpkg-deb is available
if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb could not be found"
  echo "Please install dpkg-deb before running this script"
  exit 1
fi

SERVICE_NAME="medplum-server"
TMP_DIR="medplum-server-deb"
LIB_DIR="$TMP_DIR/usr/lib/$SERVICE_NAME"
ETC_DIR="$TMP_DIR/etc/$SERVICE_NAME"
VAR_DIR="$TMP_DIR/var/lib/$SERVICE_NAME"
SYSTEM_DIR="$TMP_DIR/lib/systemd/system"
DEBIAN_DIR="$TMP_DIR/DEBIAN"

# Get version
VERSION=$(node -p "require('./package.json').version")
echo "Building version $VERSION"

# Clear previous builds
rm -rf "$TMP_DIR"
rm -rf "$SERVICE_NAME-$VERSION.deb"

# Copy package files
PACKAGES=("core" "definitions" "fhir-router" "server")
for package in ${PACKAGES[@]}; do
  echo "Copy $package"
  mkdir -p "$LIB_DIR/packages/$package"
  cp "packages/$package/package.json" "$LIB_DIR/packages/$package"
  cp -r "packages/$package/dist" "$LIB_DIR/packages/$package"
done

# Copy root package.json
cp package.json "$LIB_DIR"

# Create the server config
mkdir -p "$ETC_DIR"
cp packages/server/medplum.config.json "$ETC_DIR"
sed -i "s|file:./binary/|file:/var/lib/$SERVICE_NAME/binary/|g" "$ETC_DIR/medplum.config.json"

# Create the data directory
mkdir -p "$VAR_DIR/binary"
echo "Medplum data files" > "$VAR_DIR/README.txt"

# Move into the working directory
pushd "$LIB_DIR"

# Install dependencies
npm i --omit=dev --omit=optional --omit=peer

# Move back to the original directory
popd

# Create the systemd service definition
mkdir -p "$SYSTEM_DIR"
cat > "$SYSTEM_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Medplum Server
After=network.target

[Service]
ExecStart=/usr/bin/node /usr/lib/$SERVICE_NAME/packages/server/dist/index.js "file:/etc/$SERVICE_NAME/medplum.config.json"
Restart=always
User=$SERVICE_NAME
Group=$SERVICE_NAME
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/usr/lib/$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

# Create Debian files
mkdir -p "$DEBIAN_DIR"

# Create the Debian control file
cat > "$DEBIAN_DIR/control" <<EOF
Package: $SERVICE_NAME
Version: $VERSION
Section: base
Priority: optional
Architecture: all
Depends: nodejs
Maintainer: Medplum <hello@medplum.com>
Description: Medplum FHIR Server
EOF

# Create the Debian post-install script
cat > "$DEBIAN_DIR/postinst" <<EOF
#!/bin/sh
addgroup --system $SERVICE_NAME
adduser --system --ingroup $SERVICE_NAME $SERVICE_NAME
chown $SERVICE_NAME:$SERVICE_NAME "/var/lib/$SERVICE_NAME"
systemctl daemon-reload
systemctl enable $SERVICE_NAME.service
EOF

# Create the Debian pre-remove script
cat > "$DEBIAN_DIR/prerm" <<EOF
#!/bin/sh
systemctl stop $SERVICE_NAME.service
systemctl disable $SERVICE_NAME.service
EOF

# Set permissions
chmod 755 "$DEBIAN_DIR/postinst"
chmod 755 "$DEBIAN_DIR/prerm"

# Build the package
dpkg-deb --build --root-owner-group -Zgzip "$TMP_DIR" "$SERVICE_NAME-$VERSION.deb"

# Cleanup
rm -rf "$TMP_DIR"

# Done
echo "Done"

