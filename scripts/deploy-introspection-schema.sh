# Taking a compressed introspection schema file and uploading it to S3
# This is specifically for s3://graphiq.medplum.com/schema/

VERSION=$1
CLIENT_ID=$2
CLIENT_SECRET=$3

curl 'http://localhost:8103/fhir/R4/$graphql' \
  -u $CLIENT_ID:$CLIENT_SECRET \
  -H 'Content-Type: application/json' \
  --data-raw '{"query":" query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } ","operationName":"IntrospectionQuery"}' \
  > schema-$VERSION.json

gzip schema-$VERSION.json

aws s3 cp ./schema-$VERSION.json.gz "s3://graphiql.medplum.com/schema/schema-$VERSION.json" \
  --content-type "application/json" \
  --content-encoding "gzip" \
  --cache-control "public, max-age=31536000"

DISTRIBUTION_ID="EHQLELOC60YLM"

aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/schema/schema-$VERSION.json"
