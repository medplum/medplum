// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import type { MedplumClient, ProfileResource } from '@medplum/core';
import type { Message } from '../../types/spaces';
import { createReference, getReferenceString } from '@medplum/core';

/**
 * Creates a new conversation topic (main Communication resource)
 * @param medplum - The Medplum client instance
 * @param title - The title of the conversation
 * @param model - The AI model being used
 * @returns The created Communication resource
 */
export async function createConversationTopic(
  medplum: MedplumClient,
  title: string,
  model: string
): Promise<Communication> {
  const profile = medplum.getProfile();
  if (!profile?.id) {
    throw new Error('Profile not found');
  }

  const topic: Communication = {
    resourceType: 'Communication',
    status: 'in-progress',
    identifier: [
      {
        system: 'http://medplum.com/ai-message',
        value: 'ai-message-topic',
      },
    ],
    sender: createReference(profile),
    topic: {
      text: title,
    },
    note: [
      {
        text: JSON.stringify({ model }),
      },
    ],
  };

  return medplum.createResource(topic);
}

/**
 * Saves a message as a Communication resource linked to the topic
 * @param medplum - The Medplum client instance
 * @param topicId - The ID of the conversation topic
 * @param message - The message to save
 * @param sequenceNumber - The sequence number of the message
 * @returns The created Communication resource
 */
export async function saveMessage(
  medplum: MedplumClient,
  topicId: string,
  message: Message,
  sequenceNumber: number
): Promise<Communication> {
  const communication: Communication = {
    resourceType: 'Communication',
    status: 'completed',
    identifier: [
      {
        system: 'http://medplum.com/ai-message',
        value: 'ai-message',
      },
    ],
    partOf: [
      {
        reference: `Communication/${topicId}`,
      },
    ],
    payload: [
      {
        contentString: JSON.stringify({
          role: message.role,
          content: message.content,
          tool_calls: message.tool_calls,
          tool_call_id: message.tool_call_id,
          resources: message.resources,
          sequenceNumber,
        }),
      },
    ],
  };

  return medplum.createResource(communication);
}

/**
 * Loads the last messages for a conversation topic
 * @param medplum - The Medplum client instance
 * @param topicId - The ID of the conversation topic
 * @returns Array of messages
 */
export async function loadConversationMessages(medplum: MedplumClient, topicId: string): Promise<Message[]> {
  const communications = await medplum.searchResources('Communication', {
    'part-of': `Communication/${topicId}`,
    _sort: '_lastUpdated',
  });

  const messages: { message: Message; sequenceNumber: number }[] = [];

  for (const comm of communications) {
    if (comm.payload?.[0]?.contentString) {
      try {
        const data = JSON.parse(comm.payload[0].contentString);
        messages.push({
          message: {
            role: data.role,
            content: data.content,
            tool_calls: data.tool_calls,
            tool_call_id: data.tool_call_id,
            resources: data.resources,
          },
          sequenceNumber: data.sequenceNumber || 0,
        });
      } catch (error) {
        throw new Error(`Failed to parse message: ${error}`);
      }
    }
  }

  return messages.map((m) => m.message);
}

/**
 * Loads recent conversation topics
 * @param medplum - The Medplum client instance
 * @param limit - Maximum number of topics to return
 * @returns Array of conversation topic Communications
 */
export async function loadRecentTopics(medplum: MedplumClient, limit: number = 10): Promise<Communication[]> {
  const profile = await medplum.getProfile();
  return medplum.searchResources('Communication', {
    identifier: 'http://medplum.com/ai-message|ai-message-topic',
    sender: getReferenceString(profile as ProfileResource),
    _sort: '-_lastUpdated',
    _count: String(limit),
  });
}
