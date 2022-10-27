// start-block core-imports
import fetch from 'node-fetch';
import { MedplumClient } from '@medplum/core';

// end-block core-imports

// start-block api-keys
const MY_CLIENT_ID = 'MY_CLIENT_ID';
const MY_CLIENT_SECRET = 'MY_CLIENT_SECRET';
// end-block api-keys

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  fetch: fetch,
});
await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);

// start-block search-patients
await medplum.searchResources('Patient', new URLSearchParams({ name: 'Alex', _count: '20', _sort: '-_lastUpdated' }));
/* OR */
await medplum.searchResources('Patient', 'name=Alex&_count=20&_sort=-_lastUpdated');
// end-block search-patients

// start-block search-reports
await medplum.searchResources(
  'DiagnosticReport',
  new URLSearchParams({ _count: '100', subject: 'Patient/017d49f2-955a-1620-bc31-f96b72f5770e' })
);
/* OR */
await medplum.searchResources('DiagnosticReport', '_count=100&subject=Patient/017d49f2-955a-1620-bc31-f96b72f5770e');
// end-block search-reports
