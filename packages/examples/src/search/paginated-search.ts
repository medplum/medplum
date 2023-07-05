import { MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

/*
// start-block searchCountCurl
curl https://api.medplum.com/Patient?_count=50
// end-block searchCountCurl
*/
// start-block searchCount
await medplum.searchResources('Patient', { _count: '50' });
// end-block searchCount

/*
// start-block searchOffsetCurl
curl https://api.medplum.com/Patient?_count=50&_offset=30
// end-block searchOffsetCurl
*/
// start-block searchOffset
await medplum.searchResources('Patient', { _count: '50', _offset: '30' });
// end-block searchOffset

// start-block paginatedSearch
for await (const patientPage of medplum.searchResourcePages('Patient', { _count: 10 })) {
  for (const patient of patientPage) {
    console.log(`Processing Patient resource with ID: ${patient.id}`);
  }
}
// end-block paginatedSearch

/*
//start-block searchTotalCurl
curl https://api.medplum.com/fhir/R4/Patient?name=smith&_total=accurate
//end-block searchTotalCurl
*/

//start-block searchTotal
await medplum.search('Patient', { name: 'Smith', _total: 'accurate' });
//end-block searchTotal

// start-block searchTotalResult
const response: Bundle = {
  resourceType: 'Bundle',
  id: 'bundle-id',
  type: 'searchset',
  total: 15,
  entry: [
    {
      fullUrl: 'http://example.com/base/Patient/1',
      resource: {
        resourceType: 'Patient',
        // ...
      },
    },
    {
      fullUrl: 'http://example.com/base/Patient/2',
      resource: {
        resourceType: 'Patient',
        // ...
      },
    },
    // ...
  ],
  // ...
};
// end-block searchTotalResult

console.log(response);
