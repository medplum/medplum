#!/usr/bin/env bash

# AZURE USAGE: (requires az cli to be installed and authenticated)
# It uploads the files to the $web container of the specified storage account.
# npm ci --include dev && npm run build:fast
# STORAGE_ACCOUNT=medplumapp ./scripts/deploy-app-azure.sh

if [[ -z "${STORAGE_ACCOUNT}" ]]; then
  echo "STORAGE_ACCOUNT is missing"
  exit 1
fi

CONTAINER='$web'

pushd packages/app


# First deploy hashed files that are cached forever
# It is important to deploy these files first,
# because they are referenced by the index.html file.
find dist -type f ! -name '*.html' -print0 | while IFS= read -r -d '' file
do
  # Remove "dist/" prefix for blob name if desired
  blob_name="${file#dist/}"
  az storage blob upload \
    --account-name "${STORAGE_ACCOUNT}" \
    --container-name "${CONTAINER}" \
    --file "${file}" \
    --name "${blob_name}" \
    --overwrite true \
    --content-cache-control "public, max-age=31536000"
done

# Now deploy named files that are not cached.
# These are small lightweight files that are not hashed.
# It is important to deploy these files last,
# because they reference the previously uploaded hashed files.
find dist -type f -name '*.html' -print0 | while IFS= read -r -d '' file
do
  blob_name="${file#dist/}"
  az storage blob upload \
    --account-name "${STORAGE_ACCOUNT}" \
    --container-name "${CONTAINER}" \
    --file "${file}" \
    --name "${blob_name}" \
    --overwrite true \
    --content-cache-control "no-cache"
done

popd
