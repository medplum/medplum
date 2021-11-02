#!/usr/bin/env bash

pushd docs/build

# Copy all non-HTML assets
# Mark as public and cached forever
aws s3 cp ./ s3://medplum-docs/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html" \
  --exclude "sitemap.xml" \
  --exclude ".nojekyll"

# Copy index.html
# Set non-cache so clients revalidate
aws s3 cp index.html s3://medplum-docs/index.html \
  --profile medplum \
  --region us-east-1 \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-cache"

# Copy sitemap.xml
# Set non-cache so clients revalidate
aws s3 cp sitemap.xml s3://medplum-docs/sitemap.xml \
  --profile medplum \
  --region us-east-1 \
  --content-type "application/xml; charset=utf-8" \
  --cache-control "no-cache"

# Copy all other HTML assets
# Copy without file extension, but explicitly set the content type
# Set non-cache so clients revalidate
shopt -s globstar
for input_file in **/*.html; do
  output_file=${input_file%.html}
  aws s3 cp "$input_file" "s3://medplum-docs/$output_file" \
    --profile medplum \
    --region us-east-1 \
    --content-type "text/html; charset=utf-8" \
    --cache-control "no-cache"
done

popd
