import { MedplumClient } from '@medplum/core';

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

for await (const page of medplum.searchResourcePages('Patient', { _count: 10 })) {
  for (const patient of page) {
    console.log(`Processing Patient resource with ID: ${patient.id}`);
  }
}
// end-block paginatedSearch
