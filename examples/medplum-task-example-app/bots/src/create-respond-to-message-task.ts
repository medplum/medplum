import { getReferenceString, MedplumClient, parseReference } from '@medplum/core';
import { Bundle, BundleEntry, Communication, Practitioner, Reference, ResourceType, Task } from '@medplum/fhirtypes';

/**
 * This bot creates a task for any messages that have not been responded to in 30 minutes. It is set to run every 15 minutes, and
 * only create one task per thread. If an employee has already responded to the thread, it will automatically be assigned to that
 * employee, otherwise it will be assigned to the Care Coordinator queue.
 *
 * @param medplum - The medplum client
 * @returns Promise<any>
 */
export async function handler(medplum: MedplumClient): Promise<any> {
  const currentDate = new Date();
  const thirtyMinutesAgo = new Date(currentDate.getTime() - 30 * 60 * 1000);
  const timeStamp = thirtyMinutesAgo.toISOString();

  // Get all messages that are part of an active thread and older than 30 minutes
  const messages: Communication[] = await medplum.searchResources('Communication', {
    sent: `lt${timeStamp}`,
    'part-of:missing': false,
    'part-of:Communication.status': 'in-progress',
  });

  // Filter for messages that have not been responded to
  const unrespondedMessages = messages.filter(
    (message) => getMessageSenderType(message) === 'Patient' && !message.inResponseTo
  );

  // If all messages have been responded to, return
  if (unrespondedMessages.length === 0) {
    console.log('No messages in the last 30 minutes that require a response.');
    return false;
  }

  const searchBundle = buildSearchBundle(unrespondedMessages);

  // Execute a batch search for all thread messages
  const threadMessages = await medplum.executeBatch(searchBundle);

  const threads: Record<string, Communication[]> = {};

  // Go through each message and store with its thread
  if (threadMessages.entry) {
    organizeThreads(threadMessages.entry, threads);
  }

  // Go through each thread and create a task if necessary
  for (const thread in threads) {
    if (Object.hasOwn(threads, thread)) {
      const messages = threads[thread];

      // Check if there is already an existing task to respond to this message
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
        };

        // If somebody has already responded to this thread, assign the task to them, otherwise assign to care coordinator queue
        if (sender) {
          task.owner = sender;
        } else {
          task.performerType = [
            {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '768820003',
                  display: 'Care Coordinator',
                },
              ],
            },
          ];
        }

        await medplum.createResource(task);
      } else {
        console.log('Task already exists for this thread.');
      }
    }
  }

  return true;
}

function organizeThreads(messages: BundleEntry[], threads: Record<string, Communication[]>): void {
  for (const message of messages) {
    const communication = message.resource;
    if (communication?.resourceType !== 'Communication' || !communication.partOf) {
      continue;
    }

    const threadReferenceString = getReferenceString(communication.partOf[0]);

    if (!threads[threadReferenceString]) {
      threads[threadReferenceString] = [];
    }

    threads[threadReferenceString].push(communication);
  }
}

// Gets the most recent practitioner to have responded to a thread
function getMostRecentResponder(thread: Communication[]): Reference<Practitioner> | undefined {
  for (const message of thread) {
    const senderType = getMessageSenderType(message);
    if (senderType === 'Practitioner') {
      return message.sender as Reference<Practitioner>;
    }
  }

  return undefined;
}

// Checks that there isn't already a task assigned to the thread
async function checkNoExistingTask(medplum: MedplumClient, threadHeader: string): Promise<boolean> {
  const existingTasks = await medplum.searchResources('Task', {
    focus: threadHeader,
    'status:not': 'complete',
  });

  if (existingTasks.length === 0) {
    return true;
  } else {
    return false;
  }
}

// Builds a search bundle to get all the messages from multiple threads in one batch request
function buildSearchBundle(messages: Communication[]): Bundle {
  const requestBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
  };

  for (const message of messages) {
    if (!message.partOf) {
      continue;
    }
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

// Returns the ResourceType that sent a message
function getMessageSenderType(message: Communication): ResourceType | undefined {
  const sender = message.sender;
  if (!sender) {
    return undefined;
  }

  const senderReference = parseReference(sender);

  return senderReference?.[0];
}
