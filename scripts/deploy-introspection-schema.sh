# Taking a compressed introspection schema file and uploading it to S3
# This is specifically for s3://graphiq.medplum.com/schema/

version=$1
client_id=$2
client_secret=$3

curl 'http://localhost:8103/fhir/R4/$graphql' \
  -u $client_id:$client_secret \
  -H 'Content-Type: application/json' \
  --data-raw '{"query":" query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } ","operationName":"IntrospectionQuery"}' \
  > schema-$version.json

gzip schema-$version.json

aws s3 cp ./schema-$version.json "s3://graphiq.medplum.com/schema/schema-$version.json" \
  --content-type "application/json" \
  --content-encoding "gzip" \
  --cache-control "public, max-age=31536000"

secret_value="/schema/schema-$version.json"
gh secret set MEDPLUM_INTROSPECTION_URL -b"$secret_value"
