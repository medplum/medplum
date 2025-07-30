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

# Service variables
# These represent the required directories and files for the service
SERVICE_NAME="medplum"
TMP_DIR="medplum-deb"
LIB_DIR="$TMP_DIR/usr/lib/$SERVICE_NAME"
ETC_DIR="$TMP_DIR/etc/$SERVICE_NAME"
VAR_DIR="$TMP_DIR/var/lib/$SERVICE_NAME"
SYSTEM_DIR="$TMP_DIR/lib/systemd/system"
DEBIAN_DIR="$TMP_DIR/DEBIAN"
NGINX_SITES_AVAILABLE_DIR="$TMP_DIR/etc/nginx/sites-available"

# Placeholder values for app build
# These are same placeholder values used in `.github/build.yml`
MEDPLUM_BASE_URL="__MEDPLUM_BASE_URL__"
MEDPLUM_CLIENT_ID="__MEDPLUM_CLIENT_ID__"
MEDPLUM_REGISTER_ENABLED="__MEDPLUM_REGISTER_ENABLED__"
MEDPLUM_AWS_TEXTRACT_ENABLED="__MEDPLUM_AWS_TEXTRACT_ENABLED__"
GOOGLE_CLIENT_ID="__GOOGLE_CLIENT_ID__"
RECAPTCHA_SITE_KEY="__RECAPTCHA_SITE_KEY__"

# Get version
VERSION=$(node -p "require('./package.json').version")
echo "Building version $VERSION"

# Clear previous builds
rm -rf "$TMP_DIR"
rm -rf "$SERVICE_NAME-$VERSION.deb"

# Copy package files
PACKAGES=("app" "ccda" "core" "definitions" "fhirtypes" "fhir-router" "react" "react-hooks" "server")
for package in ${PACKAGES[@]}; do
  echo "Copy $package"
  mkdir -p "$LIB_DIR/packages/$package"
  cp "packages/$package/package.json" "$LIB_DIR/packages/$package"
  cp -r "packages/$package/dist" "$LIB_DIR/packages/$package"
done

# Copy root package.json
cp package.json "$LIB_DIR"
cp package-lock.json "$LIB_DIR"

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
npm ci --omit=dev --omit=optional --omit=peer

# Move back to the original directory
popd

# Create the systemd service definition
mkdir -p "$SYSTEM_DIR"

# Create the service file
cat > "$SYSTEM_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Medplum
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

# Create the nginx sites-available directory
mkdir -p "$NGINX_SITES_AVAILABLE_DIR"

# Create the app site configuration
cat > "$NGINX_SITES_AVAILABLE_DIR/medplum-app" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # React app built files location
    root /usr/lib/medplum/packages/app/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Main location block
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # HTML files should not be cached (for SPA routing)
    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    # All other files can be cached (they have content-based hashes)
    location ~* \.(?!html$) {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

# Create the server site configuration
cat > "$NGINX_SITES_AVAILABLE_DIR/medplum-server" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:8103;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Create Debian files
mkdir -p "$DEBIAN_DIR"

# Create the Debian template variables
cat > "$DEBIAN_DIR/templates" <<EOF
Template: medplum/server_hostname
Type: string
Default: api.example.com
Description: API Server Hostname
 Enter the hostname where the Medplum API server will be accessible.

Template: medplum/app_hostname
Type: string
Default: app.example.com
Description: Web Application Hostname
 Enter the hostname where the Medplum web application will be accessible.

Template: medplum/db_host
Type: string
Default: localhost
Description: Database Host
 Enter the PostgreSQL server hostname.
 Leave as localhost if the database is on this machine.

Template: medplum/db_password
Type: password
Description: Database Password
 Choose a password for the Medplum database user.
 This will be used to create the initial database user.
EOF

# Create the Debian config script
# This file will be executed by debconf to ask the user for configuration values
cat > "$DEBIAN_DIR/config" <<EOF
#!/bin/sh
set -e

# Source debconf library
. /usr/share/debconf/confmodule

# Ask the questions
db_input high medplum/server_hostname || true
db_input high medplum/app_hostname || true
db_input medium medplum/db_host || true
if db_get medplum/db_host && [ "\$RET" != "localhost" ]; then
    db_input high medplum/db_password || true
fi
db_go || true
EOF

# Create the Debian control file
# "Depends" is a list of packages that must be installed
# "Recommends" is a list of packages that are recommended, and will be installed by default
# "Suggests" is a list of packages that are suggested, but not installed by default
cat > "$DEBIAN_DIR/control" <<EOF
Package: $SERVICE_NAME
Version: $VERSION
Section: base
Priority: optional
Architecture: all
Depends: debconf, nodejs
Recommends: nginx, postgresql-16, redis-server
Suggests: certbot
Maintainer: Medplum <hello@medplum.com>
Description: Medplum Server
EOF

# Create the Debian post-install script
cat > "$DEBIAN_DIR/postinst" <<EOF
#!/bin/sh
set -e

# Source debconf library
. /usr/share/debconf/confmodule

# Get the configured values
db_get medplum/server_hostname
SERVER_HOSTNAME="\$RET"
db_get medplum/app_hostname
APP_HOSTNAME="\$RET"
db_get medplum/db_host
DB_HOST="\$RET"
db_get medplum/db_password
DB_PASSWORD="\$RET"

# Update the app config
# Recursively apply to all text files in the app dist directory
find "/usr/lib/medplum/packages/app/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|https://\${SERVER_HOSTNAME}/|g" \
  -e "s|__MEDPLUM_CLIENT_ID__|\${MEDPLUM_CLIENT_ID}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|\${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|\${RECAPTCHA_SITE_KEY}|g" \
  -e "s|__MEDPLUM_REGISTER_ENABLED__|\${MEDPLUM_REGISTER_ENABLED}|g" \
  {} \;

# Update the server config
if [ -f /etc/medplum/medplum.config.json ]; then
    # Update baseUrl
    sed -i "s|\"baseUrl\":[[:space:]]*\"[^\"]*\"|\"baseUrl\": \"https://\$SERVER_HOSTNAME/\"|" /etc/medplum/medplum.config.json

    # Update appBaseUrl
    sed -i "s|\"appBaseUrl\":[[:space:]]*\"[^\"]*\"|\"appBaseUrl\": \"https://\$APP_HOSTNAME/\"|" /etc/medplum/medplum.config.json
fi

# Update nginx configurations if they exist
if [ -f /etc/nginx/sites-available/medplum-server ]; then
    sed -i "s|api\.example\.com|\$SERVER_HOSTNAME|g" /etc/nginx/sites-available/medplum-server
    sed -i "s|app\.example\.com|\$APP_HOSTNAME|g" /etc/nginx/sites-available/medplum-server
fi

if [ -f /etc/nginx/sites-available/medplum-app ]; then
    sed -i "s|api\.example\.com|\$SERVER_HOSTNAME|g" /etc/nginx/sites-available/medplum-app
    sed -i "s|app\.example\.com|\$APP_HOSTNAME|g" /etc/nginx/sites-available/medplum-app
fi

# Create the Medplum user
addgroup --system $SERVICE_NAME
adduser --system --ingroup $SERVICE_NAME $SERVICE_NAME
chown $SERVICE_NAME:$SERVICE_NAME "/var/lib/$SERVICE_NAME"

# Start or restart the service
if [ "\$1" = "configure" ]; then
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME.service
    if [ -n "\$2" ]; then
        # Restart the service if this is an upgrade
        systemctl restart $SERVICE_NAME
    else
        # Start the service if this is a fresh install
        systemctl start $SERVICE_NAME
    fi
fi
EOF

# Create the Debian pre-remove script
cat > "$DEBIAN_DIR/prerm" <<EOF
#!/bin/sh
set -e

# Only fully stop/disable on package removal
if [ "\$1" = "remove" ]; then
    systemctl stop $SERVICE_NAME.service
    systemctl disable $SERVICE_NAME.service
fi

# For upgrades, we only need to stop the service temporarily
if [ "\$1" = "upgrade" ]; then
    systemctl stop $SERVICE_NAME.service
fi
EOF

# Set permissions
chmod 755 "$DEBIAN_DIR/config"
chmod 755 "$DEBIAN_DIR/postinst"
chmod 755 "$DEBIAN_DIR/prerm"

# Build the package
# Use the standard Debian package naming convention: <name>_<version>_<architecture>.deb
# We can use architecture "all" because we are not building a binary package
DEB_FILENAME="${SERVICE_NAME}_${VERSION}_all.deb"
dpkg-deb --build --root-owner-group -Zgzip "$TMP_DIR" "$DEB_FILENAME"

# Generate the checksum
CHECKSUM_FILENAME="$DEB_FILENAME.sha256"
sha256sum "$DEB_FILENAME" > "$CHECKSUM_FILENAME"

# Check the checksum
sha256sum --check "$CHECKSUM_FILENAME"

# Cleanup temp files
rm -rf "$TMP_DIR"

# Done
echo "Done"

