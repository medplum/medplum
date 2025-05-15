#!/bin/sh

# Error on bad command
set -e

# Defaults taken from .env.defaults in Medplum monorepo packages/app
: ${MEDPLUM_BASE_URL:="http://localhost:8103/"}
: ${MEDPLUM_CLIENT_ID:=""}
: ${GOOGLE_CLIENT_ID:=""}
: ${RECAPTCHA_SITE_KEY:="6LfHdsYdAAAAAC0uLnnRrDrhcXnziiUwKd8VtLNq"}
: ${MEDPLUM_REGISTER_ENABLED:="true"}
: ${MEDPLUM_AWS_TEXTRACT_ENABLED:="true"}

# Find all JS files in the assets directory
# Update the app config
# Recursively apply to all text files in the app dist directory
find "/usr/share/nginx/html/assets" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__|${MEDPLUM_CLIENT_ID}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" \
  -e "s|__MEDPLUM_REGISTER_ENABLED__|${MEDPLUM_REGISTER_ENABLED}|g" \
  -e "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${MEDPLUM_AWS_TEXTRACT_ENABLED}|g" \
  {} \;

echo "Environment variable replacement complete."

# Start nginx
exec nginx -g 'daemon off;'
