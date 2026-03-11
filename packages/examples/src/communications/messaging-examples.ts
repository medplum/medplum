// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block filterActiveThreadsTs
const activeThreads = await medplum.searchResources('Communication', {
  'part-of:missing': true,
  'status:not': 'completed',
});
// end-block filterActiveThreadsTs

/*
// start-block filterActiveThreadsCli
medplum get 'Communication?part-of:missing=true&status:not=completed'
// end-block filterActiveThreadsCli

// start-block filterActiveThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&status:not=completed' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block filterActiveThreadsCurl
*/

// start-block unreadCountTs
const unreadCount = await medplum.search('Communication', {
  recipient: `Practitioner/${userId}`,
  'status:not': 'completed',
  'part-of:missing': false,
  _total: 'accurate',
  _count: 0,
});
const count = unreadCount.total ?? 0;
// end-block unreadCountTs

/*
// start-block unreadCountCli
medplum get 'Communication?recipient=Practitioner/{userId}&status:not=completed&part-of:missing=false&_total=accurate&_count=0'
// end-block unreadCountCli

// start-block unreadCountCurl
curl 'https://api.medplum.com/fhir/R4/Communication?recipient=Practitioner/{userId}&status:not=completed&part-of:missing=false&_total=accurate&_count=0' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block unreadCountCurl
*/

// start-block loadDraftsTs
const myDrafts = await medplum.searchResources('Communication', {
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
const threads = await medplum.searchResources('Communication', {
  'part-of:missing': true,
  'status:not': 'completed',
});
// end-block queryAllThreadsTs

/*
// start-block queryAllThreadsCli
medplum get 'Communication?part-of:missing=true&status:not=completed'
// end-block queryAllThreadsCli

// start-block queryAllThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&status:not=completed' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block queryAllThreadsCurl
*/

// start-block queryMessagesInThreadTs
const messages = await medplum.searchResources('Communication', {
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


// start-block loadThreadsWithMessagesTs
const threadsWithMessages = await medplum.searchResources('Communication', {
  'part-of:missing': true,
  _revinclude: 'Communication:part-of',
});
// end-block loadThreadsWithMessagesTs

/*
// start-block loadThreadsWithMessagesCli
medplum get 'Communication?part-of:missing=true&_revinclude=Communication:part-of'
// end-block loadThreadsWithMessagesCli

// start-block loadThreadsWithMessagesCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&_revinclude=Communication:part-of' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block loadThreadsWithMessagesCurl
*/

// start-block filterByPatientTs
const patientThreads = await medplum.searchResources('Communication', {
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


// start-block filterMyThreadsTs
const myThreads = await medplum.searchResources('Communication', {
  'part-of:missing': true,
  recipient: getReferenceString(profile),
  'status:not': 'completed',
});
// end-block filterMyThreadsTs

/*
// start-block filterMyThreadsCli
medplum get 'Communication?part-of:missing=true&recipient=Practitioner/{id}&status:not=completed'
// end-block filterMyThreadsCli

// start-block filterMyThreadsCurl
curl 'https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&recipient=Practitioner/{id}&status:not=completed' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block filterMyThreadsCurl
*/

// start-block poolTasksTs
const poolTasks = await medplum.search('Task', {
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
