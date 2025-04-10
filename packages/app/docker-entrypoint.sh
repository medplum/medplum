#!/bin/sh

# Find all JS files in the assets directory
for file in $(find /usr/share/nginx/html/assets -name "*.js"); do
  echo "Processing $file..."

  # Replace placeholder values with actual environment variables, but only if defined
  if [ -n "${MEDPLUM_BASE_URL}" ]; then
    sed -i "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" "$file"
    echo "  - Replaced MEDPLUM_BASE_URL"
  fi

  if [ -n "${MEDPLUM_CLIENT_ID}" ]; then
    sed -i "s|__MEDPLUM_CLIENT_ID__|${MEDPLUM_CLIENT_ID}|g" "$file"
    echo "  - Replaced MEDPLUM_CLIENT_ID"
  fi

  if [ -n "${GOOGLE_CLIENT_ID}" ]; then
    sed -i "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" "$file"
    echo "  - Replaced GOOGLE_CLIENT_ID"
  fi

  if [ -n "${RECAPTCHA_SITE_KEY}" ]; then
    sed -i "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" "$file"
    echo "  - Replaced RECAPTCHA_SITE_KEY"
  fi

  if [ -n "${MEDPLUM_REGISTER_ENABLED}" ]; then
    sed -i "s|__MEDPLUM_REGISTER_ENABLED__|${MEDPLUM_REGISTER_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_REGISTER_ENABLED"
  fi

  if [ -n "${MEDPLUM_AWS_TEXTRACT_ENABLED}" ]; then
    sed -i "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${MEDPLUM_AWS_TEXTRACT_ENABLED}|g" "$file"
    echo "  - Replaced MEDPLUM_AWS_TEXTRACT_ENABLED"
  fi
done

echo "Environment variable replacement complete."

# Start nginx
exec nginx -g 'daemon off;'
