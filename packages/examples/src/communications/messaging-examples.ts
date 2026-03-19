// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient, getReferenceString } from '@medplum/core';

// end-block imports

const medplum = new MedplumClient();

const userId = 'example-user-id';
const currentUser = { id: 'example-user-id' };
const threadHeader = { id: 'example-thread-header' };
const profile = { resourceType: 'Practitioner' as const, id: 'example-user-id' };

// start-block filterActiveThreadsTs
// Used in the Thread Lifecycle page to show how to find open threads
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  'status:not': 'completed,entered-in-error,stopped,unknown',
});
// end-block filterActiveThreadsTs

/*
// start-block filterActiveThreadsCli
medplum get 'Communication?part-of:missing=true&status:not=completed,entered-in-error,stopped,unknown'
// end-block filterActiveThreadsCli

// start-block filterActiveThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&status:not=completed,entered-in-error,stopped,unknown' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block filterActiveThreadsCurl
*/

// start-block unreadCountTs
// Count unread messages by querying read-receipt Tasks still in 'requested' status
// The returned Bundle's `total` field contains the unread count
await medplum.search('Task', {
  code: 'https://medplum.com/task-codes|read-receipt',
  owner: `Practitioner/${userId}`,
  status: 'requested',
  _total: 'accurate',
  _count: 0,
});
// end-block unreadCountTs

/*
// start-block unreadCountCli
medplum get 'Task?code=https://medplum.com/task-codes|read-receipt&owner=Practitioner/{userId}&status=requested&_total=accurate&_count=0'
// end-block unreadCountCli

// start-block unreadCountCurl
curl 'https://api.medplum.com/fhir/R4/Task?code=https%3A%2F%2Fmedplum.com%2Ftask-codes%7Cread-receipt&owner=Practitioner/{userId}&status=requested&_total=accurate&_count=0' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block unreadCountCurl
*/

// start-block loadDraftsTs
// Set `sender` on draft Communications at creation time so they can be queried per user
await medplum.searchResources('Communication', {
  sender: `Practitioner/${currentUser.id}`,
  status: 'preparation',
});
// end-block loadDraftsTs

/*
// start-block loadDraftsCli
medplum get 'Communication?sender=Practitioner/{currentUserId}&status=preparation'
// end-block loadDraftsCli

// start-block loadDraftsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?sender=Practitioner/{currentUserId}&status=preparation' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block loadDraftsCurl
*/

// start-block queryAllThreadsTs
// Search reference: find all thread headers, sorted by most recently active
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  'status:not': 'completed,entered-in-error,stopped,unknown',
  _sort: '-_lastUpdated',
});
// end-block queryAllThreadsTs

/*
// start-block queryAllThreadsCli
medplum get 'Communication?part-of:missing=true&status:not=completed,entered-in-error,stopped,unknown&_sort=-_lastUpdated'
// end-block queryAllThreadsCli

// start-block queryAllThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&status:not=completed,entered-in-error,stopped,unknown&_sort=-_lastUpdated' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block queryAllThreadsCurl
*/

// start-block queryMessagesInThreadTs
// Retrieve all messages in a thread, sorted chronologically
await medplum.searchResources('Communication', {
  'part-of': `Communication/${threadHeader.id}`,
  _sort: 'sent',
});
// end-block queryMessagesInThreadTs

/*
// start-block queryMessagesInThreadCli
medplum get 'Communication?part-of=Communication/{threadHeaderId}&_sort=sent'
// end-block queryMessagesInThreadCli

// start-block queryMessagesInThreadCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of=Communication/{threadHeaderId}&_sort=sent' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block queryMessagesInThreadCurl
*/

// start-block filterByPatientTs
// Filter threads to a specific patient
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  subject: 'Patient/homer-simpson',
});
// end-block filterByPatientTs

/*
// start-block filterByPatientCli
medplum get 'Communication?part-of:missing=true&subject=Patient/homer-simpson'
// end-block filterByPatientCli

// start-block filterByPatientCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&subject=Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block filterByPatientCurl
*/

// start-block filterMyThreadsTs
// Filter to only the current user's active threads
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  recipient: getReferenceString(profile),
  'status:not': 'completed,entered-in-error,stopped,unknown',
});
// end-block filterMyThreadsTs

/*
// start-block filterMyThreadsCli
medplum get 'Communication?part-of:missing=true&recipient=Practitioner/{id}&status:not=completed,entered-in-error,stopped,unknown'
// end-block filterMyThreadsCli

// start-block filterMyThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&recipient=Practitioner/{id}&status:not=completed,entered-in-error,stopped,unknown' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block filterMyThreadsCurl
*/

// start-block poolTasksTs
// Task-based routing: find unclaimed Tasks in a pool by performer role
await medplum.search('Task', {
  performer: 'http://snomed.info/sct|17561000',
  'owner:missing': true,
  _include: 'Task:focus',
});
// end-block poolTasksTs

/*
// start-block poolTasksCli
medplum get 'Task?performer=http://snomed.info/sct|17561000&owner:missing=true&_include=Task:focus'
// end-block poolTasksCli

// start-block poolTasksCurl
curl 'https://api.medplum.com/fhir/R4/Task?performer=http%3A%2F%2Fsnomed.info%2Fsct%7C17561000&owner:missing=true&_include=Task:focus' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block poolTasksCurl
*/
