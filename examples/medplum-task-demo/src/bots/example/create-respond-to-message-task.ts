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
export async function handler(medplum: MedplumClient): Promise<boolean> {
  const currentDate = new Date();
  const thirtyMinutesAgo = new Date(currentDate.getTime() - 30 * 60 * 1000).toISOString();

  // Get all messages that are part of an active thread and older than 30 minutes. For more information on how threads work see https://www.medplum.com/docs/communications/organizing-communications
  const messages: Communication[] = await medplum.searchResources('Communication', {
    sent: `lt${thirtyMinutesAgo}`,
    'part-of:Communication.status': 'in-progress',
  });

  // Filter for messages sent by patients
  const patientMessages = messages.filter((message) => getMessageSenderType(message) === 'Patient');

  // If no messages from patients, return
  if (patientMessages.length === 0) {
    console.log('No messages in the last 30 minutes that require a response.');
    return false;
  }

  // Create and execute a batch search for fetch all thread messages
  const threadMessages = await fetchMessageThreads(patientMessages, medplum);

  if (!threadMessages.entry) {
    return false;
  }

  // Go through each thread and create a task if necessary
  for (const entry of threadMessages.entry) {
    const threadBundle = entry.resource as Bundle;
    const thread = threadBundle.entry;
    const mostRecentMessage = thread?.[0].resource as Communication;
    const threadHeader = mostRecentMessage.partOf?.[0].reference;

    // If the most recent message is not by a patient, the thread has been responded to, and no task should be created
    if (getMessageSenderType(mostRecentMessage) !== 'Patient' || !threadHeader) {
      continue;
    }

    // Check if there is already an existing task to respond to this message
    if (await checkNoExistingTask(medplum, threadHeader)) {
      // Get the most recent employee to respond to this thread, if anyone has
      const sender = getMostRecentResponder(messages) as Reference<Practitioner> | undefined;

      // Define a task to respond to the message
      const task: Task = {
        resourceType: 'Task',
        focus: {
          reference: threadHeader,
        },
        code: {
          text: 'Respond to Message',
        },
        status: 'ready',
        intent: 'order',
      };

      // If somebody has already responded to this thread, assign the task to them, otherwise assign to care coordinator queue
      if (sender) {
        task.owner = sender;
        console.log('Assigned to most recent responder');
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
        console.log('Assigned to care coordinator queue');
      }

      await medplum.createResource(task).then((result) => console.log(result));
      console.log('Task created');
    } else {
      console.log('Task already exists for this thread.');
    }
  }

  return true;
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
async function fetchMessageThreads(messages: Communication[], medplum: MedplumClient): Promise<Bundle> {
  const requestBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
  };

  const threads = new Set();

  for (const message of messages) {
    if (!message.partOf) {
      continue;
    }
    // Get the parent communication representing the thread
    const partOf = message.partOf;

    const threadHeader = partOf.filter((reference) => parseReference(reference)?.[0] === 'Communication')[0];

    const threadHeaderReference = getReferenceString(threadHeader);

    if (!threads.has(threadHeaderReference)) {
      threads.add(threadHeaderReference);
      // Query for all of the messages in the thread
      const searchQuery = `Communication?part-of=${threadHeaderReference}&_sort=-sent`;

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
  }

  const messageThreads = await medplum.executeBatch(requestBundle);
  return messageThreads;
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
