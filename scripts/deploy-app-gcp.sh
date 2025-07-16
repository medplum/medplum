#!/usr/bin/env bash

# GCP USAGE: (requires gcloud cli to be installed and authenticated)
# npm ci --include dev && npm run build:fast
# APP_BUCKET=medplum-static-assets ./scripts/deploy-app-gcp.sh

if [[ -z "${APP_BUCKET}" ]]; then
  echo "APP_BUCKET is missing"
  exit 1
fi

pushd packages/app


# First deploy hashed files that are cached forever
# It is important to deploy these files first,
# because they are referenced by the index.html file.
gcloud storage rsync -r --cache-control "public, max-age=31536000" -x '.*\.html$' dist gs://${APP_BUCKET}

# Now deploy named files that are not cached.
# These are small lightweight files that are not hashed.
# It is important to deploy these files last,
# because they reference the previously uploaded hashed files.
gcloud storage rsync -r --cache-control "no-cache" -x '^(?!.*\.html$).*' dist gs://${APP_BUCKET}


popd
