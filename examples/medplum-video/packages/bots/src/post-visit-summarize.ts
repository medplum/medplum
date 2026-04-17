// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Communication, DocumentReference, Encounter } from '@medplum/fhirtypes';
import { EXT } from './constants';

/**
 * Bot: post-visit-summarize
 *
 * Trigger: Subscription on Encounter?class=VR&status=finished
 *
 * Gathers all transcript Communication resources for the encounter,
 * assembles a full transcript, and creates a DocumentReference
 * with docStatus=preliminary for provider review.
 *
 * Skips if an AI clinical note already exists (e.g. produced by
 * the live scribe agent during the session).
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the finished Encounter.
 * @returns Resolves when the summary DocumentReference is created or skipped.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;

  const comms = await medplum.searchResources('Communication', {
    encounter: `Encounter/${encounter.id}`,
    _sort: '_lastUpdated',
    _count: '1000',
  });

  if (comms.length === 0) {
    console.log('No transcript data found — skipping summarization');
    return;
  }

  const existingNotes = await medplum.searchResources('DocumentReference', {
    'encounter': `Encounter/${encounter.id}`,
    'category': 'ai-clinical-note',
  });

  if (existingNotes.length > 0) {
    console.log('AI note already exists from live session — skipping');
    return;
  }

  const fullTranscript = comms
    .map((c: Communication) => {
      const speaker =
        c.extension?.find((e) => e.url === EXT.transcriptSpeaker)?.valueString ?? 'unknown';
      const text = c.payload?.[0]?.contentString ?? '';
      return `[${speaker}] ${text}`;
    })
    .join('\n');

  const binary = await medplum.createResource({
    resourceType: 'Binary',
    contentType: 'text/markdown',
    data: Buffer.from(
      `# Post-Visit Summary\n\n_Auto-generated from transcript — review required_\n\n## Transcript\n\n${fullTranscript}`
    ).toString('base64'),
  });

  const today = new Date().toISOString().split('T')[0];
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: 'preliminary',
    type: {
      coding: [{ system: 'http://loinc.org', code: '75476-2', display: 'Physician Note' }],
    },
    category: [
      {
        coding: [
          {
            system: 'https://medplum.com/fhir/CodeSystem/document-category',
            code: 'ai-clinical-note',
            display: 'AI Clinical Note',
          },
        ],
      },
    ],
    subject: encounter.subject,
    context: { encounter: [{ reference: `Encounter/${encounter.id}` }] },
    content: [
      {
        attachment: {
          contentType: 'text/markdown',
          url: `Binary/${binary.id}`,
          title: `Post-Visit Note — ${today}`,
        },
      },
    ],
    extension: [
      {
        url: EXT.aiAgentSource,
        valueString: 'post-visit-summarize-bot',
      },
    ],
  });

  console.log(`Created post-visit summary for Encounter/${encounter.id}`);
}
