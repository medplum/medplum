import { BotEvent, getReferenceString, MedplumClient, parseReference } from '@medplum/core';
import { Bundle, BundleEntry, Communication, Practitioner, Reference, Task } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const currentDate = new Date();
  const thirtyMinutesAgo = new Date(currentDate.getTime() - 30 * 60 * 1000);
  const timeStamp = thirtyMinutesAgo.toISOString();

  // Get all messages that are part of an active thread and older than 30 minutes
  const messages: Communication[] = await medplum.searchResources('Communication', {
    _lastUpdated: `lt${timeStamp}`,
    'part-of:missing': false,
    'part-of:Communication.status': 'in-progress',
  });

  // Filter for messages that have not been responded to
  const unrespondedMessages = messages.filter((message) => {
    getMessageSenderType(message) === 'Patient' && !message.inResponseTo;
  });

  // If all messages have been responded to, return
  if (unrespondedMessages.length === 0) {
    return false;
  }

  const searchBundle = buildSearchBundle(unrespondedMessages);

  // Execute a batch search for all thread messages
  const threadMessages = await medplum.executeBatch(searchBundle);

  const threads: Record<string, Communication[]> = {};

  if (threadMessages.entry) {
    for (const message of threadMessages.entry) {
      const communication = message.resource;
      if (communication?.resourceType !== 'Communication' || !communication.partOf) continue;

      const threadReferenceString = getReferenceString(communication.partOf[0]);

      if (!threads[threadReferenceString]) {
        threads[threadReferenceString] = [];
      }

      threads[threadReferenceString].push(communication);
    }
  }

  for (const thread in threads) {
    const messages = threads[thread];

    if (await checkNoExistingTask(medplum, thread)) {
      const sender = getMostRecentResponder(messages) as Reference<Practitioner> | undefined;
      const task: Task = {
        resourceType: 'Task',
        focus: {
          reference: thread,
        },
        code: {
          text: 'Respond to Message',
        },
        performerType: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '768820003',
                display: 'Care Coordinator',
              },
            ],
          },
        ],
      };

      if (sender) {
        task.owner = sender;
      }
    }
  }
}

function getMostRecentResponder(thread: Communication[]) {
  for (const message of thread) {
    const senderType = getMessageSenderType(message);
    if (senderType === 'Practitioner') {
      return message.sender;
    }
  }
}

async function checkNoExistingTask(medplum: MedplumClient, threadHeader: string) {
  const existingTasks = await medplum.searchResources('Task', {
    focus: threadHeader,
  });

  if (existingTasks.length === 0) {
    return true;
  } else {
    return false;
  }
}

function buildSearchBundle(messages: Communication[]): Bundle {
  const requestBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
  };

  for (const message of messages) {
    if (!message.partOf) continue;
    // Get the parent communication representing the thread
    const threadHeader = getReferenceString(message.partOf[0]);

    // Query for all of the messages in the thread
    const searchQuery = `Communication?part-of=${threadHeader}&_sort=-sent`;

    // Add the search to a bundle to execute a batch request to get all threads with messages that haven't been responded to
    const entry: BundleEntry = {
      request: {
        method: 'GET',
        url: searchQuery,
      },
    };

    if (requestBundle.entry) {
      requestBundle.entry.push(entry);
    } else {
      requestBundle.entry = [entry];
    }
  }

  return requestBundle;
}

function getMessageSenderType(message: Communication) {
  const sender = message.sender;
  if (!sender) {
    return undefined;
  }

  const senderReference = parseReference(sender);

  return senderReference?.[0];
}
