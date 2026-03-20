// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { getReferenceString, MedplumClient, SNOMED } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';

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

console.log(newTask);

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
        contentString: 'The specimen for you patient, Homer Simpson, has been received.',
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
