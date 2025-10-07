// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Auto-responder bot that generates automated responses to practitioner messages.
 *
 * Only responds to messages from practitioners in communication threads.
 * Prevents infinite loops by checking for "Auto-generated response" in the note field.
 *
 * @param medplum - The Medplum client instance
 * @param event - The bot event containing the Communication resource
 * @returns A new Communication resource with auto-response, or undefined
 */

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Communication>
): Promise<Communication | undefined> {
  const communication = event.input;
  if (!communication.sender?.reference?.startsWith('Practitioner/')) {
    return undefined;
  }
  if (!communication.partOf?.find((partOf) => partOf.reference?.startsWith('Communication/'))) {
    return undefined;
  }
  if (communication.note?.find((note) => note.text?.includes('Auto-generated response'))) {
    return undefined;
  }

  const autoResponse = await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    sender: communication.recipient?.[0] as Reference<Patient>,
    recipient: [communication.sender],
    payload: [
      {
        contentString: 'This is an auto generated response',
      },
    ],
    partOf: communication.partOf,
    sent: new Date().toISOString(),
    note: [{ text: 'Auto-generated response' }],
  });

  return autoResponse;
}
