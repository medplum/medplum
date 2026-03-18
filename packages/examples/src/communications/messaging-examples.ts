// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient, getReferenceString } from '@medplum/core';
import type { BotEvent } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';

// end-block imports

const medplum = new MedplumClient();

const userId = 'example-user-id';
const currentUser = { id: 'example-user-id' };
const threadHeader = { id: 'example-thread-header' };
const profile = { resourceType: 'Practitioner' as const, id: 'example-user-id' };
const readReceiptTaskId = 'example-read-receipt-task-id';
const latestMessageId = 'latest-message-id';
const recipientId = 'recipient-practitioner-id';

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

// start-block loadThreadsWithMessagesTs
// Load thread headers and all their child messages in a single request
await medplum.searchResources('Communication', {
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

// start-block messageTaskLifecycleTs
// Bot: handle Task lifecycle for new messages. Creates a Task when no open Task exists, completes it when a provider responds.
export async function handler(medplum: MedplumClient, event: BotEvent<Communication>): Promise<void> {
  const message = event.input;
  const threadRef = message.partOf?.[0]?.reference;
  if (!threadRef || !message.subject || !message.sender) {
    return;
  }

  const openTasks = await medplum.searchResources('Task', {
    focus: threadRef,
    status: 'requested,accepted',
  });

  if (openTasks.length === 0) {
    // No open Task for this thread — create one
    await medplum.createResource({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: 'routine',
      focus: { reference: threadRef },
      for: message.subject,
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
      authoredOn: new Date().toISOString(),
    });
    return;
  }

  // Open Task exists — check if this message is from someone other than the patient
  const task = openTasks[0];
  const senderRef = message.sender.reference;
  const patientRef = task.for?.reference;

  if (senderRef && senderRef !== patientRef) {
    // Sender is not the patient — treat as a provider response and complete the Task
    await medplum.patchResource('Task', task.id!, [
      { op: 'replace', path: '/status', value: 'completed' },
      {
        op: 'add',
        path: '/output/-',
        value: {
          type: { text: 'Response' },
          valueReference: { reference: `Communication/${message.id}` },
        },
      },
    ]);
  }
}
// end-block messageTaskLifecycleTs

// start-block subscriptionMessageTaskLifecycleTs
await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'Create or complete Tasks when messages are sent in a thread',
  criteria: 'Communication?part-of:missing=false&status=in-progress',
  channel: {
    type: 'rest-hook',
    endpoint: 'Bot/{your-message-task-lifecycle-bot-id}',
  },
});
// end-block subscriptionMessageTaskLifecycleTs

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

// start-block subscriptionStaleReminderTs
await medplum.createResource({
  resourceType: 'Subscription',
  status: 'active',
  reason: 'Notify provider about stale thread',
  criteria: 'Task?code=https://medplum.com/task-codes|respond-to-old-message&status=requested',
  channel: {
    type: 'rest-hook',
    endpoint: 'Bot/{your-notification-bot-id}',
  },
});
// end-block subscriptionStaleReminderTs
