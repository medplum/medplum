aws s3 cp dist/ "s3://graphiq.medplum.com/" \
  --content-type "text/plain" \
  --cache-control "public, max-age=31536000" \
  --include "../introspection-schema.json" \ 
  --content-encoding "gzip"