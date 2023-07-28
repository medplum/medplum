#!/usr/bin/env bash

# Taking a compressed introspection schema file and uploading it to S3
# This is specifically for s3://graphiq.medplum.com/schema/

CLIENT_ID=$1
CLIENT_SECRET=$2

# If the client ID is empty or not specified, exit
if [[ -z "${CLIENT_ID}" ]]; then
  echo "Missing CLIENT_ID"
  echo "Usage: deploy-introspection-schema.sh [CLIENT_ID] [CLIENT_SECRET]"
  exit 1
fi

# If the client secret is empty or not specified, exit
if [[ -z "${CLIENT_SECRET}" ]]; then
  echo "Missing CLIENT_SECRET"
  echo "Usage: deploy-introspection-schema.sh [CLIENT_ID] [CLIENT_SECRET]"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

VERSION=$(date +%Y-%m-%d)
echo "Using version $VERSION"

# Download the schema
curl 'http://localhost:8103/fhir/R4/$graphql' \
  -u $CLIENT_ID:$CLIENT_SECRET \
  -H 'Content-Type: application/json' \
  --data-raw '{"query":" query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } ","operationName":"IntrospectionQuery"}' \
  > "schema-$VERSION.json"

# Compress the schema
gzip "schema-$VERSION.json"

# Upload the schema
for v in "$VERSION" "latest"; do
  aws s3 cp "./schema-$VERSION.json.gz" "s3://graphiql.medplum.com/schema/schema-$v.json" \
    --content-type "application/json" \
    --content-encoding "gzip" \
    --cache-control "public, max-age=31536000"
done

# Create an invlidation file
DISTRIBUTION_ID="EHQLELOC60YLM"
DATESTRING=$(date +"%Y-%m-%d_%H-%M-%S")
JSON_STRING='
{
  "Paths": {
    "Quantity": 2,
    "Items": ["/schema/schema-'$VERSION'.json","/schema/schema-latest.json"]
  },
  "CallerReference": "'$DATESTRING'"
}
'
echo $JSON_STRING > tmp-cloudfront-invalidation.json

# Invalidate
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --invalidation-batch file://./tmp-cloudfront-invalidation.json

# Clean up
rm tmp-cloudfront-invalidation.json
rm "schema-$VERSION.json.gz"
