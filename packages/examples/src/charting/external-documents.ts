// start-block imports
import { MedplumClient, getReferenceString } from '@medplum/core';

// end-block imports

const medplum = new MedplumClient();
const data = '1234ABC';

// start-block docReferenceBinaryTS
// Create a `Binary` resource with file data
const binary = await medplum.createBinary(data, 'records.pdf', 'application/pdf');

// Create the `DocumentReference` resource
const docReference = await medplum.createResource({
  resourceType: 'DocumentReference',
  status: 'current',
  content: [
    {
      attachment: {
        title: 'External Records',
        url: getReferenceString(binary),
      },
    },
  ],
});
// end-block docReferenceBinaryTS
console.log(docReference);

/*
// start-block docReferenceBinaryCURL
curl 'https://api.medplum.com/fhir/R4/Binary?_filename=records.pdf' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: text/plain' \
  --data-raw '{"resourceType":"Binary","contentType":"text/plain", "data": "$DATA"}' \

# {
#   "resourceType": "Binary",
#   "id": "example-binary-id",
#   "url": "https://storage.medplum.com/binary/..."
#    ...
# }

  curl -X POST 'https://api.medplum.com/fhir/R4/DocumentReference' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  --data-raw '{"resourceType":"DocumentReference","content":[{"attachment":{"contentType":"text/plain","url":"Binary/10c959e4-4d70-4c25-a58c-c1c4f604b15a","title":"External Records"}}],"status":"current"}' \

  # {
#   "resourceType": "DocumentReference",
#   "id": "example-doc-reference-id",
#   "content": [
#     {
#       "attachment": {
#         "contentType": "text/plain",
#         "url": "https://storage.medplum.com/binary/...",
#         "title": "External Records"
#       }
#     }
#   ],
#   "status": "current",
#   ...
# }

  // end-block docReferenceBinaryCURL
*/

/*
// start-block docReferenceBinaryCLI
medplum login
medplum post Binary 'data-as-string'

# {
#   "resourceType": "Binary",
#   "id": "example-binary-id",
#   "url": "https://storage.medplum.com/binary/..."
#    ...
# }

medplum post DocumentReference '{"resourceType":"DocumentReference","content":[{"attachment":{"contentType":"application/pdf","url":"Binary/example-binary-id","title":"External Records"}}],"status":"current"}'

# {
#   "resourceType": "DocumentReference",
#   "id": "example-doc-reference-id",
#   "content": [
#     {
#       "attachment": {
#         "contentType": "text/plain",
#         "url": "https://storage.medplum.com/binary/...",
#         "title": "External Records"
#       }
#     }
#   ],
#   "status": "current",
#   ...
# }
// end-block docReferenceBinaryCLI
*/
