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

# Get version
VERSION=$(node -p "require('./package.json').version")

echo "Building version $VERSION"

# Clear previous builds
rm -rf medplum-server-deb

# Create a temp directory for the build
mkdir -p medplum-server-deb/usr/lib/medplum-server/packages/core
mkdir -p medplum-server-deb/usr/lib/medplum-server/packages/definitions
mkdir -p medplum-server-deb/usr/lib/medplum-server/packages/fhir-router
mkdir -p medplum-server-deb/usr/lib/medplum-server/packages/server

# Copy files
cp package.json medplum-server-deb/usr/lib/medplum-server
cp packages/core/package.json medplum-server-deb/usr/lib/medplum-server/packages/core
cp -r packages/core/dist medplum-server-deb/usr/lib/medplum-server/packages/core
cp packages/definitions/package.json medplum-server-deb/usr/lib/medplum-server/packages/definitions
cp -r packages/definitions/dist medplum-server-deb/usr/lib/medplum-server/packages/definitions
cp packages/fhir-router/package.json medplum-server-deb/usr/lib/medplum-server/packages/fhir-router
cp -r packages/fhir-router/dist medplum-server-deb/usr/lib/medplum-server/packages/fhir-router
cp packages/server/package.json medplum-server-deb/usr/lib/medplum-server/packages/server
cp -r packages/server/dist medplum-server-deb/usr/lib/medplum-server/packages/server

# Move into the medplum-server directory
pushd medplum-server-deb/usr/lib/medplum-server

# Install dependencies
npm i --omit=dev --omit=optional --omit=peer

# Move back to the original directory
popd

# Create the systemd service definition
mkdir -p medplum-server-deb/lib/systemd/system
cat > medplum-server-deb/lib/systemd/system/medplum-server.service <<EOF
[Unit]
Description=Medplum Server
After=network.target

[Service]
ExecStart=/usr/bin/node /usr/lib/medplum-server/packages/server/dist/index.js
Restart=always
User=nobody
Group=nogroup
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/usr/lib/medplum-server

[Install]
WantedBy=multi-user.target
EOF

# Create Debian files
mkdir -p medplum-server-deb/DEBIAN

# Create the Debian control file
cat > medplum-server-deb/DEBIAN/control <<EOF
Package: medplum-server
Version: $VERSION
Section: base
Priority: optional
Architecture: amd64
Depends: nodejs
Maintainer: Medplum <hello@medplum.com>
Description: Medplum FHIR Server
EOF

# Create the Debian post-install script
cat > medplum-server-deb/DEBIAN/postinst <<EOF
#!/bin/sh
systemctl daemon-reload
systemctl enable medplum-server.service
EOF

# Create the Debian pre-remove script
cat > medplum-server-deb/DEBIAN/prerm <<EOF
#!/bin/sh
systemctl stop medplum-server.service
systemctl disable medplum-server.service
EOF

# Set permissions
chmod 755 medplum-server-deb/DEBIAN/postinst
chmod 755 medplum-server-deb/DEBIAN/prerm

# Build the package
dpkg-deb --build medplum-server-deb

# Rename the deb file
mv medplum-server-deb.deb medplum-server-$VERSION.deb

# Cleanup
rm -rf medplum-server-deb

# Done
echo "Done"

