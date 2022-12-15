#!/usr/bin/env bash

if [[ -z "${APP_BUCKET}" ]]; then
  echo "APP_BUCKET is missing"
  exit 1
fi

pushd packages/app

# No cache

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "application/manifest+json" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.webmanifest"

aws s3 cp dist/service-worker.js "s3://${APP_BUCKET}/" \
  --content-type "application/javascript" \
  --cache-control "no-cache"

aws s3 cp dist/service-worker.js.map "s3://${APP_BUCKET}/" \
  --content-type "application/json" \
  --cache-control "no-cache"

# Cache forever

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/css" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.css"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "application/javascript" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.js" \
  --exclude "service-worker.js"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "application/json" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.css.map" \
  --include "*.js.map" \
  --exclude "service-worker.js.map"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/plain" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.txt"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/x-icon" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.ico"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/png" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.png"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/svg+xml" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.svg"

popd
