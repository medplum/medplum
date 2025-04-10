#!/bin/sh

# Defaults taken from .env.defaults in Medplum monorepo packages/app
DEFAULT_MEDPLUM_BASE_URL=http://localhost:8103/
DEFAULT_MEDPLUM_CLIENT_ID=
DEFAULT_GOOGLE_CLIENT_ID=
DEFAULT_RECAPTCHA_SITE_KEY=6LfHdsYdAAAAAC0uLnnRrDrhcXnziiUwKd8VtLNq
DEFAULT_MEDPLUM_REGISTER_ENABLED=true
DEFAULT_MEDPLUM_AWS_TEXTRACT_ENABLED=true

# Find all JS files in the assets directory
for file in $(find /usr/share/nginx/html/assets -name "*.js"); do
  echo "Processing $file..."

  # Replace placeholder values with actual environment variables, but only if defined
  if [ -n "${MEDPLUM_BASE_URL}" ]; then
    sed -i "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" "$file"
    echo "  - Replaced MEDPLUM_BASE_URL with ${MEDPLUM_BASE_URL}"
  else
    sed -i "s|__MEDPLUM_BASE_URL__|${DEFAULT_MEDPLUM_BASE_URL}|g" "$file"
    echo "  - Replaced MEDPLUM_BASE_URL with default value: ${DEFAULT_MEDPLUM_BASE_URL}"
  fi

  if [ -n "${MEDPLUM_CLIENT_ID}" ]; then
    sed -i "s|__MEDPLUM_CLIENT_ID__|${MEDPLUM_CLIENT_ID}|g" "$file"
    echo "  - Replaced MEDPLUM_CLIENT_ID with ${MEDPLUM_CLIENT_ID}"
  else
    sed -i "s|__MEDPLUM_CLIENT_ID__|${DEFAULT_MEDPLUM_CLIENT_ID}|g" "$file"
    echo "  - Replaced MEDPLUM_CLIENT_ID with default value: ${DEFAULT_MEDPLUM_CLIENT_ID}"
  fi

  if [ -n "${GOOGLE_CLIENT_ID}" ]; then
    sed -i "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" "$file"
    echo "  - Replaced GOOGLE_CLIENT_ID with ${GOOGLE_CLIENT_ID}"
  else
    sed -i "s|__GOOGLE_CLIENT_ID__|${DEFAULT_GOOGLE_CLIENT_ID}|g" "$file"
    echo "  - Replaced GOOGLE_CLIENT_ID with default value: ${DEFAULT_GOOGLE_CLIENT_ID}"
  fi

  if [ -n "${RECAPTCHA_SITE_KEY}" ]; then
    sed -i "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" "$file"
    echo "  - Replaced RECAPTCHA_SITE_KEY with ${RECAPTCHA_SITE_KEY}"
  else
    sed -i "s|__RECAPTCHA_SITE_KEY__|${DEFAULT_RECAPTCHA_SITE_KEY}|g" "$file"
    echo "  - Replaced RECAPTCHA_SITE_KEY with default value: ${DEFAULT_RECAPTCHA_SITE_KEY}"
  fi

  if [ -n "${MEDPLUM_REGISTER_ENABLED}" ]; then
    sed -i "s|__MEDPLUM_REGISTER_ENABLED__|${MEDPLUM_REGISTER_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_REGISTER_ENABLED with ${MEDPLUM_REGISTER_ENABLED}"
  else
    sed -i "s|__MEDPLUM_REGISTER_ENABLED__|${DEFAULT_MEDPLUM_REGISTER_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_REGISTER_ENABLED with default value: ${DEFAULT_MEDPLUM_REGISTER_ENABLED}"
  fi

  if [ -n "${MEDPLUM_AWS_TEXTRACT_ENABLED}" ]; then
    sed -i "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${MEDPLUM_AWS_TEXTRACT_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_AWS_TEXTRACT_ENABLED with ${MEDPLUM_AWS_TEXTRACT_ENABLED}"
  else
    sed -i "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${DEFAULT_MEDPLUM_AWS_TEXTRACT_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_AWS_TEXTRACT_ENABLED with default value: ${DEFAULT_MEDPLUM_AWS_TEXTRACT_ENABLED}"
  fi
done

echo "Environment variable replacement complete."

# Start nginx
exec nginx -g 'daemon off;'
