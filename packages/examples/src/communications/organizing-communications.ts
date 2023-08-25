// start-block imports
import { MedplumClient } from '@medplum/core';
import { Communication }  from '@medplum/fhirtypes'

// end-block imports

const medplum = new MedplumClient();

// start-block searchParentThreadsTs
// Search for a Communication-grouped thread
await medplum.searchResources('Communication', {
  'part-of:missing': true,
});
// end-block searchParentThreadsTs

/*
// start-block searchParentThreadsCli
medplum get 'Communication?part-of:missing=true'
// end-block searchParentThreadsCli

// start-block searchParentThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchParentThreadsCurl
*/

// start-block searchSpecificThreadTs
await medplum.searchResources('Communication', {
  'part-of': 'Communication/example-communication',
  _sort: 'sent'
});
// end-block searchSpecificThreadTs

/*
// start-block searchSpecificThreadCli
medplum get 'Communication?part-of=Communication/example-communication&_sort=sent'
// end-block searchSpecificThreadCli

// start-block searchSpecificThreadCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of=Communication/example-communication&_sort=sent' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchSpecificThreadCurl
*/

// start-block searchEncounterThreadTs
await medplum.searchResources('Communication', {
  encounter: 'Encounter/example-encounter',
  _include: 'Communication:encounter',
  _sort: 'sent',
});
// end-block searchEncounterThreadTs

/*
// start-block searchEncounterThreadCli
medplum get 'Communication?encounter=Encounter/example-encounter&_include=Communication:encounter&_sort=sent'
// end-block searchEncounterThreadCli

// start-block searchEncounterThreadCurl
curl 'https://api.medplum.com/fhir/R4/Communication?encounter=Encounter/example-encounter&_include=Communication:encounter&_sort=sent' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchEncounterThreadCurl
*/

// start-block searchThreadsWithMessagesTs
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  _revinclude: 'Communication:part-of',
});
// end-block searchThreadsWithMessagesTs

/*
// start-block searchThreadsWithMessagesCli
medplum get 'Communication?part-of:missing=true&_revinclude:Communication:part-of'
// end-block searchThreadsWithMessagesCli

// start-block searchThreadsWithMessagesCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&_revinclude=Communication:part-of' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchThreadsWithMessagesCurl
*/

// start-block searchEncountersWithMessagesTs
await medplum.searchResources('Communication', {
  'encounter:missing': false,
  _include: 'Communication:encounter',
});
// end-block searchEncountersWithMessagesTs

/*
// start-block searchEncountersWithMessagesCli
medplum get 'Communication?encounter:missing=false&_include=Communication:encounter'
// end-block searchEncountersWithMessagesCli

// start-block searchEncountersWithMessagesCurl
curl 'https://api.medplum.com/fhir/R4/Communication?encounter:missing=false&_include=Communication:encounter' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchEncountersWithMessagesCurl
*/

// start-block searchFilteredThreadsTs
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  _revinclude: 'Communication:part-of',
  subject: 'Patient/example-patient',
});
// end-block searchFilteredThreadsTs

/*
// start-block searchFilteredThreadsCli
medplum get 'Communication?part-of:missing=true&_revinclude=Communication:part-of&subject=Patient/example-patient'
// end-block searchFilteredThreadsCli

// start-block searchFilteredThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&_revinclude=Communication:part-of&subject=Patient/example-patient' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchFilteredThreadsCurl
*/

// start-block searchFilteredEncountersTs
await medplum.searchResource('Communication', {
  'encounter:missing': false,
  _include: 'Communication:encounter',
  subject: 'Patient/example-patient',
});
// end-block searchFilteredEncountersTs

/*
// start-block searchFilteredEncountersCli
medplum get 'Communication?encounter:missing=false&_include=Communication:encounter&subject=Patient/example-patient'
// end-block searchFilteredEncountersCli

// start-block searchFilteredEncountersCurl
curl 'https://api.medplum.com/fhir/R4/Communication?encounter:missing=false&_include=Communication:encounter&subject=Patient/example-patient' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchFilteredEncountersCurl
*/

const communicationThread: Communication[] = 
[
// start-block communicationGroupedThread
{
  resourceType: 'Communication',
  id: 'example-parent-communication',
  // There is no `partOf` of `payload` field on this communication
  // ...
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  }
},

// The initial communication
{
  resourceType: 'Communication',
  id: 'example-message-1',
  payload: [
    {
      id: 'example-message-1-payload',
      contentString: 'The specimen for you patient, Homer Simpson, has been received.'
    }
  ],
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  },
  // ...
  partOf: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-parent-communication'
      }
    }
  ]
},

// A second response, directly to `example-message-1` but still referencing the parent communication
{
  resourceType: 'Communication',
  id: 'example-message-2',
  payload: [
    {
      id: 'example-message-2-payload',
      contentString: 'Will the results be ready by the end of the week?'
    }
  ],
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  },
  // ...
  partOf: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-parent-communication'
      }
    }
  ],
  inResponseTo: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-message-1'
      }
    }
  ]
},

// A third response
  {
    resourceType: 'Communication',
    id: 'example-message-3',
    payload: [
      {
        id: 'example-message-2-payload',
        contentString: 'Yes, we will have them to you by Thursday.'
      }
    ],
    topic: {
      text: 'Homer Simpson April 10th lab tests'
    },
    // ...
    partOf: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-parent-communication'
        }
      }
    ],
    inResponseTo: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-message-2'
        }
      }
    ]
  }
  // end-block communicationGroupedThread
]

const categoryExampleCommunications: Communication =
// start-block communicationCategories
{
  resourceType: 'Communication',
  id: 'example-communication',
  category: [
    {
      text: 'Doctor',
      coding: [
        {
          code: '158965000',
          system: 'http://snomed.info/sct'
        }
      ]
    },
    {
      text: 'Endocrinology',
      coding: [
        {
          code: '394583002',
          system: 'http://snomed.info.sct'
        }
      ]
    },
    {
      text: 'Diabetes self-management plan',
      coding: [
        {
          code: '735985000',
          system: 'http://snomed.info.sct'
        }
      ]
    }
  ]
}
// end-block communicationCategories

console.log(communicationThread, categoryExampleCommunications);
