// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Many identifiers below exist only for documentation extraction (MedplumCodeBlock selectBlocks).
// They are marked with `void` so TypeScript noUnusedLocals stays satisfied.

// start-block imports
import type { BotEvent } from '@medplum/core';
import { ContentType, formatHumanName, getReferenceString, MedplumClient, SNOMED } from '@medplum/core';
import type { Bundle, Communication, Parameters, Patient, Slot } from '@medplum/fhirtypes';

// end-block imports

const medplum = new MedplumClient();

const userId = 'example-user-id';
const currentUser = { id: 'example-user-id' };
const threadHeader = {
  id: 'example-thread-header',
  topic: { text: 'Example thread' },
  subject: { reference: 'Patient/example' },
};
const profile = { resourceType: 'Practitioner' as const, id: 'example-user-id' };
const readReceiptTaskId = 'example-read-receipt-task-id';
const latestMessageId = 'latest-message-id';
const recipientId = 'recipient-practitioner-id';
const file = new Blob();
/** Placeholder thread id for participant add/remove examples (use a real header id in your app). */
const messagingGroupThreadId = 'example-group-thread-id';

// start-block filterActiveThreadsTs
// Thread headers have no partOf; child messages have partOf set to the header.
// part-of:missing=true therefore returns only thread headers, not individual messages.
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

// start-block simpleModelMarkReadTs
// Option A (1:1 only): Mark a message as read by setting received and status
await medplum.patchResource('Communication', 'message-id', [
  { op: 'add', path: '/received', value: new Date().toISOString() },
  { op: 'replace', path: '/status', value: 'completed' },
]);
// end-block simpleModelMarkReadTs

// start-block simpleModelQueryUnreadTs
// Option A (1:1 only): Query messages not yet read (status not completed)
await medplum.searchResources('Communication', {
  recipient: getReferenceString(profile),
  'status:not': 'completed,entered-in-error,stopped,unknown',
  'part-of:missing': false,
  _sort: '-sent',
});
// end-block simpleModelQueryUnreadTs

/*
// start-block simpleModelQueryUnreadCli
medplum get 'Communication?recipient=Practitioner/{id}&status:not=completed,entered-in-error,stopped,unknown&part-of:missing=false&_sort=-sent'
// end-block simpleModelQueryUnreadCli

// start-block simpleModelQueryUnreadCurl
curl 'https://api.medplum.com/fhir/R4/Communication?recipient=Practitioner%2F%7Bid%7D&status:not=completed,entered-in-error,stopped,unknown&part-of:missing=false&_sort=-sent' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block simpleModelQueryUnreadCurl
*/

// start-block threadHeaderWithReadExtensionTs
// Option B: Thread header with extension for per-participant last-read state (one block per participant)
const threadWithReadState = {
  resourceType: 'Communication' as const,
  status: 'in-progress' as const,
  subject: { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
  topic: { text: 'Lab results - April 10th' },
  extension: [
    {
      url: 'https://medplum.com/fhir/StructureDefinition/thread-read-state',
      extension: [
        { url: 'participant', valueReference: { reference: 'Practitioner/doctor-alice-smith' } },
        { url: 'lastRead', valueReference: { reference: 'Communication/latest-message-id' } },
        { url: 'lastReadAt', valueDateTime: '2024-03-15T14:30:00.000Z' },
      ],
    },
  ],
};
// end-block threadHeaderWithReadExtensionTs
// Satisfy TS6133 (unused variable); value only used for doc block extraction
// eslint-disable-next-line no-void
void threadWithReadState;

// start-block updateThreadReadStateTs
// Option B: Find this participant's read-state block by URL, update lastRead and lastReadAt, then PUT
const threadReadStateUrl = 'https://medplum.com/fhir/StructureDefinition/thread-read-state';
const header = await medplum.readResource('Communication', threadHeader.id);
const currentUserRef = getReferenceString(profile);
const readStateBlock = header.extension?.find((ext) => {
  if (ext.url !== threadReadStateUrl || !ext.extension) {
    return false;
  }
  const participantExt = ext.extension.find((e: { url?: string }) => e.url === 'participant');
  return (participantExt as { valueReference?: { reference?: string } })?.valueReference?.reference === currentUserRef;
});
if (readStateBlock?.extension) {
  const lastReadExt = readStateBlock.extension.find((e: { url?: string }) => e.url === 'lastRead');
  const lastReadAtExt = readStateBlock.extension.find((e: { url?: string }) => e.url === 'lastReadAt');
  if (lastReadExt) {
    (lastReadExt as { valueReference?: { reference: string } }).valueReference = {
      reference: `Communication/${latestMessageId}`,
    };
  } else {
    readStateBlock.extension.push({
      url: 'lastRead',
      valueReference: { reference: `Communication/${latestMessageId}` },
    });
  }
  const now = new Date().toISOString();
  if (lastReadAtExt) {
    (lastReadAtExt as { valueDateTime?: string }).valueDateTime = now;
  } else {
    readStateBlock.extension.push({ url: 'lastReadAt', valueDateTime: now });
  }
  await medplum.updateResource(header);
}
// end-block updateThreadReadStateTs

// start-block createReadReceiptTaskTs
// Option C: Create a read-receipt Task when a message is sent (e.g. in a Bot)
// Task.code is required; https://medplum.com/task-codes is a docs convention (not a hosted CodeSystem). Use a URI you own in production, or keep this string project-wide for consistency with the examples below.
const readReceiptTask = await medplum.createResource({
  resourceType: 'Task',
  status: 'requested',
  intent: 'order',
  code: { coding: [{ system: 'https://medplum.com/task-codes', code: 'read-receipt' }] },
  focus: { reference: `Communication/${threadHeader.id}` },
  for: { reference: 'Patient/homer-simpson' },
  owner: { reference: `Practitioner/${recipientId}` },
  authoredOn: new Date().toISOString(),
});
// end-block createReadReceiptTaskTs
// Satisfy TS6133 (unused variable); value only used for doc block extraction
// eslint-disable-next-line no-void
void readReceiptTask;

// start-block markReadReceiptTaskTs
// Option C: Mark read-receipt Task completed when user reads the message
await medplum.patchResource('Task', readReceiptTaskId, [{ op: 'replace', path: '/status', value: 'completed' }]);
// end-block markReadReceiptTaskTs

// start-block unreadInThreadTs
// Option C: Find unread messages in a specific thread for current user
await medplum.searchResources('Task', {
  code: 'https://medplum.com/task-codes|read-receipt',
  owner: getReferenceString(profile),
  focus: `Communication/${threadHeader.id}`,
  status: 'requested',
});
// end-block unreadInThreadTs

/*
// start-block unreadInThreadCli
medplum get 'Task?code=https://medplum.com/task-codes|read-receipt&owner=Practitioner/{id}&focus=Communication/{threadHeaderId}&status=requested'
// end-block unreadInThreadCli

// start-block unreadInThreadCurl
curl 'https://api.medplum.com/fhir/R4/Task?code=https%3A%2F%2Fmedplum.com%2Ftask-codes%7Cread-receipt&owner=Practitioner%2F%7Bid%7D&focus=Communication%2F%7BthreadHeaderId%7D&status=requested' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block unreadInThreadCurl
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

(async (): Promise<void> => {
  // start-block creatingFirstThreadClientCredentialsTs
  // Client credentials before FHIR calls; use real id/secret from Project Admin → Clients.
  const medplum = new MedplumClient({ baseUrl: 'https://api.medplum.com/' });
  const profile = await medplum.startClientLogin('YOUR_CLIENT_ID', 'YOUR_CLIENT_SECRET');
  console.log(profile);
  // end-block creatingFirstThreadClientCredentialsTs
})().catch(console.error);

// start-block verifyWalkthroughReferencesTs
await medplum.readResource('Patient', 'homer-simpson');
await medplum.readResource('Practitioner', 'doctor-alice-smith');
// end-block verifyWalkthroughReferencesTs

// start-block createYourFirstThreadHeaderAndFirstMessageTs
// Thread header (no payload, no partOf) plus the first child message from the clinician.
// Provider–patient thread: replace Patient and Practitioner references with real ids from your project.
// Fixed `sent` values match the April 10th topic and sort predictably in examples; use real timestamps in production.
const createdThreadHeader = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  topic: {
    text: 'Lab results for Homer Simpson - April 10th',
  },
  subject: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  sender: {
    reference: 'Practitioner/doctor-alice-smith',
    display: 'Dr. Alice Smith',
  },
  // Thread header lists every participant in recipient (including the sender) so inbox-style queries work; see Messaging Data Model.
  recipient: [
    { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
    { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
  ],
  // Optional in FHIR; included here so the header aligns with message times when demonstrating _sort=sent.
  sent: '2024-04-10T09:00:00.000Z',
});

const walkthroughFirstMessage = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  partOf: [{ reference: `Communication/${createdThreadHeader.id}` }],
  sender: {
    reference: 'Practitioner/doctor-alice-smith',
    display: 'Dr. Alice Smith',
  },
  recipient: [{ reference: 'Patient/homer-simpson', display: 'Homer Simpson' }],
  payload: [
    {
      contentString:
        'Hi Homer — we received your lab specimen and processing has started. We will message you here when results are ready.',
    },
  ],
  sent: '2024-04-10T10:00:00.000Z',
});
// end-block createYourFirstThreadHeaderAndFirstMessageTs
// eslint-disable-next-line no-void
void createdThreadHeader;
// eslint-disable-next-line no-void
void walkthroughFirstMessage;

// start-block createYourFirstThreadReplyFromAnotherUserTs
// In production this createResource call would run as another user (e.g. patient portal) with their own MedplumClient session.
// It is shown in the same file so you can try the thread end-to-end; use the same `createdThreadHeader.id` from the step above.
const walkthroughSecondMessage = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  partOf: [{ reference: `Communication/${createdThreadHeader.id}` }],
  sender: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  recipient: [{ reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' }],
  payload: [
    {
      contentString: 'Thanks — will the results be ready by the end of the week?',
    },
  ],
  sent: '2024-04-10T10:05:00.000Z',
});
// end-block createYourFirstThreadReplyFromAnotherUserTs
// eslint-disable-next-line no-void
void walkthroughSecondMessage;

// start-block createYourFirstThreadReplyInResponseToTs
// Use when the user explicitly replies to one message (not required for linear chat).
// Continues createdThreadHeader and walkthroughSecondMessage from the header, first message, and patient reply steps above.
const walkthroughReplyInResponseTo = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  partOf: [{ reference: `Communication/${createdThreadHeader.id}` }],
  sender: { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
  recipient: [{ reference: 'Patient/homer-simpson', display: 'Homer Simpson' }],
  payload: [{ contentString: 'Yes — we expect your results by Thursday. We will notify you here.' }],
  sent: '2024-04-10T10:15:00.000Z',
  inResponseTo: [{ reference: `Communication/${walkthroughSecondMessage.id}` }],
});
// end-block createYourFirstThreadReplyInResponseToTs
// eslint-disable-next-line no-void
void walkthroughReplyInResponseTo;

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

// start-block subscribeThreadMessagesTs
const threadId = 'example-thread-id';
const emitter = medplum.subscribeToCriteria(`Communication?part-of=Communication/${threadId}`);

emitter.addEventListener('message', (event) => {
  const newMessage = event.payload.entry?.find((e) => e.resource?.resourceType === 'Communication')?.resource;
  if (newMessage) {
    console.log(newMessage);
  }
});
// end-block subscribeThreadMessagesTs

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

// start-block messageWithTextAndAttachment
const attachment = await medplum.createAttachment({
  data: file,
  filename: 'lab-report.pdf',
  contentType: 'application/pdf',
});

const mixedMessage = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  partOf: [{ reference: `Communication/${threadHeader.id}` }],
  topic: threadHeader.topic,
  subject: threadHeader.subject,
  sender: { reference: 'Practitioner/doctor-alice-smith' },
  recipient: [{ reference: 'Practitioner/doctor-gregory-house' }],
  payload: [{ contentString: 'Here are the lab results we discussed.' }, { contentAttachment: attachment }],
  sent: new Date().toISOString(),
});
// end-block messageWithTextAndAttachment
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- retain for doc block extraction; satisfies noUnusedLocals
[mixedMessage];
// start-block createTaskForThreadTs
const task = await medplum.createResource({
  resourceType: 'Task',
  status: 'requested',
  intent: 'order',
  priority: 'routine',
  focus: { reference: `Communication/${threadHeader.id}` },
  for: { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
  performerType: [
    {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '224535009',
          display: 'Registered nurse',
        },
      ],
    },
  ],
  requester: { reference: 'Practitioner/doctor-alice-smith' },
  authoredOn: new Date().toISOString(),
});
// end-block createTaskForThreadTs

// start-block claimTaskTs
await medplum.patchResource('Task', task.id, [
  { op: 'replace', path: '/status', value: 'accepted' },
  {
    op: 'replace',
    path: '/owner',
    value: { reference: 'Practitioner/doctor-gregory-house', display: 'Dr. Gregory House' },
  },
]);
// end-block claimTaskTs

// start-block queryUnclaimedTasksTs
await medplum.search('Task', {
  performer: 'http://snomed.info/sct|224535009',
  status: 'requested',
});
// end-block queryUnclaimedTasksTs

/*
// start-block queryUnclaimedTasksCli
medplum get 'Task?performer=http://snomed.info/sct|224535009&status=requested'
// end-block queryUnclaimedTasksCli

// start-block queryUnclaimedTasksCurl
curl 'https://api.medplum.com/fhir/R4/Task?performer=http%3A%2F%2Fsnomed.info%2Fsct%7C224535009&status=requested' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block queryUnclaimedTasksCurl
*/

// start-block rerouteToProviderTs
await medplum.patchResource('Task', task.id, [
  {
    op: 'replace',
    path: '/owner',
    value: { reference: 'Practitioner/dr-cardio', display: 'Dr. Cardio' },
  },
  {
    op: 'remove',
    path: '/performerType',
  },
]);

await medplum.patchResource('Communication', threadHeader.id, [
  { op: 'replace', path: '/recipient', value: [{ reference: 'Practitioner/dr-cardio', display: 'Dr. Cardio' }] },
]);
// end-block rerouteToProviderTs

// start-block rerouteToPoolTs
await medplum.patchResource('Task', task.id, [
  { op: 'remove', path: '/owner' },
  { op: 'replace', path: '/status', value: 'requested' },
  {
    op: 'add',
    path: '/performerType',
    value: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '17561000',
            display: 'Cardiologist',
          },
        ],
      },
    ],
  },
]);

await medplum.patchResource('Communication', threadHeader.id, [{ op: 'remove', path: '/recipient' }]);
// end-block rerouteToPoolTs

// start-block rerouteWithNoteTs
await medplum.patchResource('Task', task.id, [
  {
    op: 'replace',
    path: '/owner',
    value: { reference: 'Practitioner/dr-cardio', display: 'Dr. Cardio' },
  },
  {
    op: 'add',
    path: '/note/-',
    value: {
      authorReference: { reference: 'Practitioner/doctor-gregory-house' },
      time: new Date().toISOString(),
      text: 'Rerouting to cardiology — patient has new cardiac symptoms',
    },
  },
]);
// end-block rerouteWithNoteTs

// start-block rerouteProvenanceTs
await medplum.createResource({
  resourceType: 'Provenance',
  target: [{ reference: `Task/${task.id}` }],
  recorded: new Date().toISOString(),
  agent: [
    {
      who: { reference: 'Practitioner/doctor-gregory-house', display: 'Dr. Gregory House' },
    },
  ],
  reason: [
    {
      coding: [
        {
          system: 'https://medplum.com/CodeSystem/reroute-reason',
          code: 'specialty-referral',
          display: 'Specialty referral',
        },
      ],
    },
  ],
});
// end-block rerouteProvenanceTs

// start-block simpleRerouteTs
await medplum.patchResource('Task', task.id, [
  { op: 'replace', path: '/owner', value: { reference: 'Practitioner/dr-cardio' } },
]);
// end-block simpleRerouteTs

// start-block dualTaskRerouteTs
const newTask = await medplum.createResource({
  resourceType: 'Task',
  status: 'requested',
  intent: 'order',
  priority: task.priority,
  focus: task.focus,
  for: task.for,
  owner: { reference: 'Practitioner/dr-cardio', display: 'Dr. Cardio' },
  requester: { reference: 'Practitioner/doctor-gregory-house' },
  authoredOn: new Date().toISOString(),
  note: [
    {
      authorReference: { reference: 'Practitioner/doctor-gregory-house' },
      time: new Date().toISOString(),
      text: 'Rerouted from original Task — needs cardiology review',
    },
  ],
});

await medplum.patchResource('Task', task.id, [
  { op: 'replace', path: '/status', value: 'cancelled' },
  {
    op: 'add',
    path: '/note/-',
    value: {
      authorReference: { reference: 'Practitioner/doctor-gregory-house' },
      time: new Date().toISOString(),
      text: 'Rerouted to Dr. Cardio — see new Task',
    },
  },
]);
// end-block dualTaskRerouteTs
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- retain for doc block extraction; satisfies noUnusedLocals
[newTask];

// start-block oooRerouteTs
// Bot: reroute Tasks to the pool when the assigned provider is out of office.
// Uses Schedule $find to check availability at message receive time.
export async function oooRerouteHandler(medplum: MedplumClient, event: BotEvent<Communication>): Promise<void> {
  const message = event.input;
  const threadRef = message.partOf?.[0]?.reference;
  if (!threadRef) {
    return;
  }

  const openTasks = await medplum.searchResources('Task', {
    focus: threadRef,
    status: 'requested,accepted',
  });

  if (openTasks.length === 0) {
    return;
  }

  const rerouteTask = openTasks[0];
  if (!rerouteTask.id) {
    return;
  }
  const ownerRef = rerouteTask.owner?.reference;
  if (!ownerRef) {
    return;
  }

  const schedules = await medplum.searchResources('Schedule', {
    actor: ownerRef,
  });

  if (schedules.length === 0) {
    return;
  }

  const schedule = schedules[0];
  if (!schedule.id) {
    return;
  }

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const result: Parameters = await medplum.post(medplum.fhirUrl('Schedule', schedule.id, '$find'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'start', valueDateTime: now.toISOString() },
      { name: 'end', valueDateTime: oneHourLater.toISOString() },
    ],
  });

  const bundle = result.parameter?.[0]?.resource as Bundle<Slot>;
  const freeSlots = bundle?.entry?.filter((e) => e.resource?.status === 'free') ?? [];

  if (freeSlots.length > 0) {
    return;
  }

  // Provider is unavailable — reroute Task back to the pool
  const threadHeaderId = threadRef.split('/')[1];
  await medplum.patchResource('Task', rerouteTask.id, [
    { op: 'remove', path: '/owner' },
    { op: 'replace', path: '/status', value: 'requested' },
    {
      op: 'add',
      path: '/note/-',
      value: {
        text: `Auto-rerouted: ${rerouteTask.owner?.display ?? ownerRef} is currently unavailable`,
        time: now.toISOString(),
      },
    },
  ]);
  await medplum.patchResource('Communication', threadHeaderId, [{ op: 'remove', path: '/recipient' }]);
}
// end-block oooRerouteTs

// start-block subscriptionOooRerouteTs
await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'Reroute Tasks when assigned provider is out of office',
  criteria: 'Communication?part-of:missing=false&status=in-progress',
  channel: {
    type: 'rest-hook',
    endpoint: 'Bot/{your-ooo-reroute-bot-id}',
  },
});
// end-block subscriptionOooRerouteTs

// start-block externalNotifyOnMessageBotTs
// Bot: bridge a new in-app child Communication to SMS, email, push, etc. (Twilio, SendGrid, Firebase, …).
export async function externalNotifyOnMessageHandler(
  medplum: MedplumClient,
  event: BotEvent<Communication>
): Promise<void> {
  const communication = event.input;
  const messageText = communication.payload?.[0]?.contentString;
  const recipientRef = communication.recipient?.[0]?.reference;
  if (!recipientRef) {
    return;
  }

  const recipient = await medplum.readReference({ reference: recipientRef });
  let contact: string | undefined;
  if (recipient.resourceType === 'Patient') {
    const patient = recipient as Patient;
    contact =
      patient.telecom?.find((t) => t.system === 'phone' && t.value)?.value ??
      patient.telecom?.find((t) => t.system === 'email' && t.value)?.value;
  }
  // Send via Twilio, SendGrid, etc. using `contact` and `messageText`
  console.log(`Sending notification to ${contact ?? recipientRef}: ${messageText}`);
}
// end-block externalNotifyOnMessageBotTs

// start-block externalNotifyExecuteTs
// After persisting the child Communication, call $execute so Twilio/SendGrid errors surface to the caller (see Bot $execute docs).
const outboundNotifyMessageId = 'emr-message-001';
const childMessageForNotify = await medplum.createResourceIfNoneExist(
  {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [{ system: 'http://example.com/emr-message', value: outboundNotifyMessageId }],
    partOf: [{ reference: 'Communication/thread-header-id' }],
    recipient: [{ reference: 'Patient/homer-simpson', display: 'Homer Simpson' }],
    payload: [{ contentString: 'Your lab results are ready.' }],
    sent: new Date().toISOString(),
  },
  `identifier=http://example.com/emr-message|${outboundNotifyMessageId}`
);

await medplum.executeBot('{your-external-notify-bot-id}', childMessageForNotify, ContentType.FHIR_JSON);
// end-block externalNotifyExecuteTs

// start-block inboundSmsConditionalSenderTs
// Inbound webhook: resolve Patient by phone at write time; set partOf using a thread-matching strategy below.
const inboundSmsWebhook = {
  fromPhoneNumber: '+15551234567',
  messageText: 'Thanks — I will review them',
  providerMessageId: 'SMxxxxxxxx',
};

await medplum.createResourceIfNoneExist(
  {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [{ system: 'http://example.com/sms-webhook-message', value: inboundSmsWebhook.providerMessageId }],
    sender: {
      reference: `Patient?phone=${inboundSmsWebhook.fromPhoneNumber}`,
    },
    payload: [{ contentString: inboundSmsWebhook.messageText }],
    sent: new Date().toISOString(),
    medium: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
            code: 'SMSWRIT',
            display: 'SMS',
          },
        ],
      },
    ],
    // partOf — see thread matching strategies below
  },
  `identifier=http://example.com/sms-webhook-message|${inboundSmsWebhook.providerMessageId}`
);
// end-block inboundSmsConditionalSenderTs

// start-block createThreadWithExternalIdTs
// Strategy 1 setup: thread header with external conversation id (must match conditional partOf below).
const exampleTwilioConversationSid = 'CHxxxxxxxx';
const threadHeaderIdentifierQuery = `identifier=https://twilio.com|${exampleTwilioConversationSid}`;
const threadHeaderWithExternalId = await medplum.upsertResource(
  {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [{ system: 'https://twilio.com', value: exampleTwilioConversationSid }],
    topic: { text: 'SMS conversation' },
    subject: { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
    sender: { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
    recipient: [
      { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
      { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
    ],
    medium: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
            code: 'SMSWRIT',
            display: 'SMS',
          },
        ],
      },
    ],
  },
  threadHeaderIdentifierQuery
);
console.log(threadHeaderWithExternalId);
// end-block createThreadWithExternalIdTs

// start-block inboundSmsWithExternalThreadIdTs
// Strategy 1: match thread via identifier on the header (e.g. Twilio Conversation SID, email thread id).
const inboundSmsWithConversation = {
  fromPhoneNumber: '+15551234567',
  messageText: 'Thanks — I will review them',
  conversationSid: 'CHxxxxxxxx',
  providerMessageId: 'SMxxxxxxxx',
};

await medplum.createResourceIfNoneExist(
  {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [
      { system: 'http://example.com/sms-webhook-message', value: inboundSmsWithConversation.providerMessageId },
    ],
    partOf: [
      {
        reference: `Communication?identifier=https://twilio.com|${inboundSmsWithConversation.conversationSid}`,
      },
    ],
    sender: {
      reference: `Patient?phone=${inboundSmsWithConversation.fromPhoneNumber}`,
    },
    payload: [{ contentString: inboundSmsWithConversation.messageText }],
    sent: new Date().toISOString(),
    medium: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
            code: 'SMSWRIT',
            display: 'SMS',
          },
        ],
      },
    ],
  },
  `identifier=http://example.com/sms-webhook-message|${inboundSmsWithConversation.providerMessageId}`
);
// end-block inboundSmsWithExternalThreadIdTs

// start-block inboundSmsActiveThreadLookupBotTs
// Strategy 2: stateless SMS — resolve Patient, then attach to most recent open thread or create one.
export async function inboundSmsActiveThreadLookupHandler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const webhookData = event.input as Record<string, string>;

  const patient = await medplum.searchOne('Patient', {
    phone: webhookData.fromPhoneNumber,
  });

  if (!patient?.id) {
    return;
  }

  const activeThreads = await medplum.searchResources('Communication', {
    'part-of:missing': true,
    subject: `Patient/${patient.id}`,
    'status:not': 'completed,entered-in-error,stopped,unknown',
    _sort: '-_lastUpdated',
    _count: '1',
  });

  let threadId: string | undefined;
  if (activeThreads.length > 0) {
    threadId = activeThreads[0].id;
  } else {
    const newThread = await medplum.createResource({
      resourceType: 'Communication',
      status: 'in-progress',
      topic: {
        text: `SMS conversation with ${formatHumanName(patient.name?.[0]) || 'Patient'}`,
      },
      subject: { reference: `Patient/${patient.id}` },
    });
    threadId = newThread.id;
  }

  if (!threadId) {
    return;
  }

  await medplum.createResourceIfNoneExist(
    {
      resourceType: 'Communication',
      status: 'in-progress',
      identifier: [{ system: 'http://example.com/sms-webhook-message', value: webhookData.providerMessageId }],
      partOf: [{ reference: `Communication/${threadId}` }],
      sender: { reference: `Patient/${patient.id}` },
      payload: [{ contentString: webhookData.messageText }],
      sent: new Date().toISOString(),
      medium: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
              code: 'SMSWRIT',
              display: 'SMS',
            },
          ],
        },
      ],
    },
    `identifier=http://example.com/sms-webhook-message|${webhookData.providerMessageId}`
  );
}
// end-block inboundSmsActiveThreadLookupBotTs

// start-block roundTripReplyBotTs
// Bot: when a provider sends an in-app reply, mirror it to SMS if the thread is tagged for SMS (medium on header).
export async function roundTripReplyBotHandler(medplum: MedplumClient, event: BotEvent<Communication>): Promise<void> {
  const message = event.input;
  const threadRef = message.partOf?.[0]?.reference;
  if (!threadRef) {
    return;
  }

  const threadHeader = await medplum.readReference({ reference: threadRef });
  if (threadHeader.resourceType !== 'Communication') {
    return;
  }
  const header = threadHeader as Communication;
  const threadUsesSms = header.medium?.some((m) => m.coding?.some((c) => c.code === 'SMSWRIT'));
  if (!threadUsesSms) {
    return;
  }

  const patientRef = header.subject?.reference;
  if (!patientRef) {
    return;
  }
  const subject = await medplum.readReference({ reference: patientRef });
  if (subject.resourceType !== 'Patient') {
    return;
  }
  const patient = subject as Patient;
  const phone = patient.telecom?.find((t) => t.system === 'phone' && t.value)?.value;
  const body = message.payload?.[0]?.contentString;
  // Send via Twilio (or your SMS provider) using `phone` and `body`
  console.log(`Round-trip SMS to ${phone ?? patientRef}: ${body}`);
}
// end-block roundTripReplyBotTs

// start-block roundTripReplyExecuteTs
// Provider flow: persist the in-app reply, then $execute the round-trip bot with that Communication as input.
const roundTripMessageId = 'app-composed-reply-001';
const providerReplyMessage = await medplum.createResourceIfNoneExist(
  {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [{ system: 'http://example.com/app-composed-message', value: roundTripMessageId }],
    partOf: [{ reference: 'Communication/thread-header-with-sms-medium' }],
    sender: { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
    recipient: [{ reference: 'Patient/homer-simpson', display: 'Homer Simpson' }],
    payload: [{ contentString: 'We can schedule a follow-up if you have questions.' }],
    sent: new Date().toISOString(),
  },
  `identifier=http://example.com/app-composed-message|${roundTripMessageId}`
);

await medplum.executeBot('{your-round-trip-bot-id}', providerReplyMessage, ContentType.FHIR_JSON);
// end-block roundTripReplyExecuteTs

// start-block staleThreadRemindersTs
// Bot (cron-triggered): find threads with no activity for N days, create a reminder Task per thread if none exists. Export as 'handler' when deploying.
export async function staleThreadRemindersHandler(medplum: MedplumClient, _event: BotEvent): Promise<void> {
  const staleDays = 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);

  const staleThreads = await medplum.searchResources('Communication', {
    'part-of:missing': true,
    status: 'in-progress',
    _lastUpdated: `lt${cutoff.toISOString()}`,
  });

  for (const thread of staleThreads) {
    if (!thread.subject) {
      continue;
    }
    const existingTasks = await medplum.searchResources('Task', {
      focus: `Communication/${thread.id}`,
      code: 'https://medplum.com/task-codes|respond-to-old-message',
      status: 'requested,accepted',
    });

    if (existingTasks.length > 0) {
      continue;
    }

    await medplum.createResource({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: 'urgent',
      code: {
        coding: [
          {
            system: 'https://medplum.com/task-codes',
            code: 'respond-to-old-message',
            display: 'Respond to old message',
          },
        ],
      },
      focus: { reference: `Communication/${thread.id}` },
      for: thread.subject,
      description: `Thread "${thread.topic?.text ?? 'Untitled'}" has been open for ${staleDays}+ days without a response`,
      authoredOn: new Date().toISOString(),
    });
  }
}
// end-block staleThreadRemindersTs

const communicationThread: Partial<Communication>[] = [
  // start-block communicationGroupedThread
  {
    resourceType: 'Communication',
    id: 'example-thread-header',
    // Thread header: no partOf or payload
    // Include the thread creator in recipient so recipient-based inbox search finds threads they started
    sender: { reference: 'Practitioner/doctor-alice-smith' },
    recipient: [{ reference: 'Practitioner/doctor-alice-smith' }, { reference: 'Practitioner/doctor-gregory-house' }],
    topic: {
      text: 'Homer Simpson April 10th lab tests',
    },
  },

  // The initial message
  {
    resourceType: 'Communication',
    id: 'example-message-1',
    payload: [
      {
        id: 'example-message-1-payload',
        contentString: 'The specimen for your patient, Homer Simpson, has been received.',
      },
    ],
    topic: {
      text: 'Homer Simpson April 10th lab tests',
    },
    // ...
    partOf: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-thread-header',
          status: 'completed',
        },
      },
    ],
  },

  // A response directly to `example-message-1` but still referencing the parent communication
  {
    resourceType: 'Communication',
    id: 'example-message-2',
    payload: [
      {
        id: 'example-message-2-payload',
        contentString: 'Will the results be ready by the end of the week?',
      },
    ],
    topic: {
      text: 'Homer Simpson April 10th lab tests',
    },
    // ...
    partOf: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-thread-header',
          status: 'completed',
        },
      },
    ],
    inResponseTo: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-message-1',
          status: 'completed',
        },
      },
    ],
  },

  // A second response
  {
    resourceType: 'Communication',
    id: 'example-message-3',
    payload: [
      {
        id: 'example-message-2-payload',
        contentString: 'Yes, we will have them to you by Thursday.',
      },
    ],
    topic: {
      text: 'Homer Simpson April 10th lab tests',
    },
    // ...
    partOf: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-thread-header',
          status: 'completed',
        },
      },
    ],
    inResponseTo: [
      {
        resource: {
          resourceType: 'Communication',
          id: 'example-message-2',
          status: 'completed',
        },
      },
    ],
  },
  // end-block communicationGroupedThread
];

console.log(communicationThread);

const categoryExampleCommunications: Communication =
  // start-block communicationCategories
  {
    resourceType: 'Communication',
    id: 'example-communication',
    status: 'completed',
    category: [
      {
        text: 'Doctor',
        coding: [
          {
            code: '158965000',
            system: SNOMED,
          },
        ],
      },
      {
        text: 'Endocrinology',
        coding: [
          {
            code: '394583002',
            system: SNOMED,
          },
        ],
      },
      {
        text: 'Diabetes self-management plan',
        coding: [
          {
            code: '735985000',
            system: SNOMED,
          },
        ],
      },
    ],
  };
// end-block communicationCategories

console.log(categoryExampleCommunications);

// start-block threadLifecycleCloseHeaderTs
await medplum.patchResource('Communication', threadHeader.id, [{ op: 'replace', path: '/status', value: 'completed' }]);
// end-block threadLifecycleCloseHeaderTs

// start-block threadLifecycleReopenHeaderTs
await medplum.patchResource('Communication', threadHeader.id, [
  { op: 'replace', path: '/status', value: 'in-progress' },
]);
// end-block threadLifecycleReopenHeaderTs

// start-block threadLifecycleGroupThreadTs
const messagingGroupThread = await medplum.createResource({
  resourceType: 'Communication',
  status: 'in-progress',
  topic: { text: 'Care coordination - Homer Simpson' },
  subject: { reference: 'Patient/homer-simpson', display: 'Homer Simpson' },
  sender: { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
  recipient: [
    { reference: 'Practitioner/doctor-alice-smith', display: 'Dr. Alice Smith' },
    { reference: 'Practitioner/doctor-gregory-house', display: 'Dr. Gregory House' },
    { reference: 'Practitioner/nurse-jackie', display: 'Nurse Jackie' },
  ],
});
console.log(messagingGroupThread);
// end-block threadLifecycleGroupThreadTs

// start-block threadLifecycleAddParticipantTs
await medplum.patchResource('Communication', messagingGroupThreadId, [
  {
    op: 'add',
    path: '/recipient/-',
    value: { reference: 'Practitioner/dr-wilson', display: 'Dr. Wilson' },
  },
]);
// end-block threadLifecycleAddParticipantTs

// start-block threadLifecycleRemoveParticipantTs
const messagingThreadForParticipants = await medplum.readResource('Communication', messagingGroupThreadId);
const messagingUpdatedRecipients = messagingThreadForParticipants.recipient?.filter(
  (r) => r.reference !== 'Practitioner/nurse-jackie'
);
await medplum.patchResource('Communication', messagingGroupThreadId, [
  { op: 'replace', path: '/recipient', value: messagingUpdatedRecipients },
]);
// end-block threadLifecycleRemoveParticipantTs

/*
// start-block messagingParticipantScopedAccessPolicyJson
{
  "resourceType": "AccessPolicy",
  "name": "Messaging - Participant Access",
  "resource": [
    {
      "resourceType": "Communication",
      "criteria": "Communication?recipient=%profile"
    },
    {
      "resourceType": "Communication",
      "criteria": "Communication?sender=%profile"
    }
  ]
}
// end-block messagingParticipantScopedAccessPolicyJson

// start-block messagingSupervisorAccessPolicyJson
{
  "resourceType": "AccessPolicy",
  "name": "Messaging - Supervisor Access",
  "resource": [
    {
      "resourceType": "Communication",
      "readonly": true
    },
    {
      "resourceType": "Task",
      "readonly": true
    }
  ]
}
// end-block messagingSupervisorAccessPolicyJson
*/
