import { getReferenceString, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

/*
  // start-block searchSingleCurl
  curl https://api.medplum.com/fhir/R4/Patient?birthdate=1940-03-29
  // end-block searchSingleCurl
*/
// start-block searchSingle
await medplum.search('Patient', { birthdate: '1940-03-29' });
// OR
await medplum.search('Patient', 'birthdate=1940-03-29');
// end-block searchSingle

/*
// start-block searchSingleReturn
// returns
{
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      fullUrl: 'http://api.medplum.com/Patient/1',
      resource: {
        resourceType: 'Patient',
        id: '1',
        name: [
          {
            given: ['John'],
            family: 'Doe',
          },
        ],
        birthDate: '1940-03-29',
      },
    },
    {
      fullUrl: 'http://api.medplum.com/Patient/2',
      resource: {
        resourceType: 'Patient',
        id: '2',
        name: [
          {
            given: ['Homer'],
            family: 'Simpson',
          },
        ],
        birthDate: '1940-03-29',
      },
    },
  ],
  link: [
    {
      relation: 'self',
      url: 'http://api.medplum.com/Patient?birthdate=1940-03-29',
    },
  ],
}
// end-block searchSingleReturn
*/

// start-block searchResourcesSingle
await medplum.searchResources('Patient', { birthdate: '1940-03-29' });

// returns
// [
//   {
//     resourceType: 'Patient',
//     id: '1',
//     birthDate: '1940-03-29',
//   },
//   {
//     resourceType: 'Patient',
//     id: '2',
//     birthDate: '1940-03-29',
//   },
// ];

// end-block searchResourcesSingle

// start-block searchSingleResult
// Returns:

// end-block searchSingleResult

/*
  // start-block searchOrCurl
  curl https://api.medplum.com/fhir/R4/Task?status=completed,cancelled
  // end-block searchOrCurl
*/
// start-block searchOr
await medplum.searchResources('Task', { status: 'completed,cancelled' });
// OR
await medplum.searchResources('Task', 'status=completed,cancelled');
// end-block searchOr

/*
// start-block searchAndCurl
curl https://api.medplum.com/fhir/R4/Patient?name=Simpson&birthdate=1940-03-29
// end-block searchAndCurl
*/
// start-block searchAnd
await medplum.searchResources('Patient', { name: 'Simpson', birthdate: '1940-03-29' });
// OR
await medplum.searchResources('Patient', 'name=Simpson&birthdate=1940-03-29');

// returns
// [
//   {
//     resourceType: 'Patient',
//     id: '2',
//     name: [
//       {
//         given: ['Homer'],
//         family: 'Simpson',
//       },
//     ],
//     birthDate: '1940-03-29',
//   },
// ]
// end-block searchAnd

// start-block searchReference
/*
// start-block searchReferenceCurl
curl https://api.medplum.com/fhir/R4/Observation?subject=Patient/1234
// end-block searchReferenceCurl
*/
const patient: Patient = { resourceType: 'Patient', id: '1234' };
await medplum.searchResources('Observation', { subject: getReferenceString(patient) });
// OR
await medplum.searchResources('Observation', { subject: 'Patient/1234' });
// end-block searchReference

/*
// start-block searchNotCurl
curl https://api.medplum.com/fhir/R4/Patient?status:not=completed
// end-block searchNotCurl
*/
// start-block searchNot
await medplum.searchResources('Task', { 'status:not': 'completed' });
//OR
await medplum.searchResources('Task', 'status:not=completed');
// end-block searchNot

/*
// start-block searchMissingCurl
curl https://api.medplum.com/fhir/R4/Patient?birthdate:missing=true
// end-block searchMissingCurl
*/

// start-block searchMissing
await medplum.searchResources('Patient', { 'birthdate:missing': 'true' });
// OR
await medplum.searchResources('Patient', 'birthdate:missing=true');
// end-block searchMissing

/*
// start-block searchContainsCurl
curl https://api.medplum.com/fhir/R4/Patient?name:contains=eve
// end-block searchContainsCurl
*/

// start-block searchContains
await medplum.searchResources('Patient', { 'name:contains': 'eve' });
// OR
await medplum.searchResources('Patient', 'name:contains=eve');

// Return patients with the names `"eve"`, `"Eve"`, `"Evelyn`",  AND `"Steve"`
// end-block searchContains

/*
// start-block searchGreaterThanCurl
curl https://api.medplum.com/fhir/R4/RiskAssessment?probability=gt0.8
// end-block searchGreaterThanCurl
*/

// start-block searchGreaterThan
await medplum.searchResources('RiskAssessment', { probability: 'gt0.8' });
// OR
await medplum.searchResources('RiskAssessment', 'probability=gt0.8');
// end-block searchGreaterThan

/*
// start-block searchInclusiveRangeCurl
curl https://api.medplum.com/fhir/R4/Observation?value-quantity=gt40&value-quantity=lt60
// end-block searchInclusiveRangeCurl
*/

// start-block searchInclusiveRange
await medplum.searchResources('Observation', [
  ['value-quantity', 'gt40'],
  ['value-quantity', 'lt60'],
]);
// OR
await medplum.searchResources('Observation', 'value-quantity=gt40&value-quantity=lt60');
// end-block searchInclusiveRange

/*
// start-block searchExclusiveRangeCurl
https://api.medplum.com/fhir/R4/Observation?value-quantity=lt40,gt60
// end-block searchExclusiveRangeCurl
*/

// start-block searchExclusiveRange
await medplum.searchResources('Observation', { 'value-quantity': 'lt40,gt60' });
// OR
await medplum.searchResources('Observation', 'value-quantity=lt40,gt60');
// end-block searchExclusiveRange

// start-block searchSort
await medplum.searchResources('RiskAssessment', { _sort: 'probability,date' });
// OR
await medplum.searchResources('RiskAssessment', '_sort=probability,date');
// end-block searchSort

/*
// start-block searchSortCurl
https://api.medplum.com/fhir/R4/RiskAssessment?_sort=probability,date
// end-block searchSortCurl
*/

// start-block searchSortDescending
await medplum.searchResources('RiskAssessment', { _sort: '-probability' });
// OR
await medplum.searchResources('RiskAssessment', '_sort=-probability');
// end-block searchSortDescending

/*
// start-block searchSortDescendingCurl
https://api.medplum.com/fhir/R4/RiskAssessment?_sort=-probability
// end-block searchSortDescendingCurl
*/

// start-block searchSortByLastUpdated
await medplum.searchResources('RiskAssessment', { _sort: '-_lastUpdated' });
// OR
await medplum.searchResources('RiskAssessment', '_sort=-_lastUpdated');
// end-block searchSortByLastUpdated

/*
// start-block searchSortByLastUpdatedCurl
https://api.medplum.com/fhir/R4/RiskAssessment?_sort=-_lastUpdated
// end-block searchSortByLastUpdatedCurl
*/
