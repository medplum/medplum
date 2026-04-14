// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { DiagnosticReport, Reference, Task } from '@medplum/fhirtypes';

/**
 * Create Review Task Bot
 *
 * Triggered by a Subscription on DiagnosticReport creation with status=preliminary.
 * Creates a Task resource for a clinician to review the AI-extracted lab results
 * before they are finalized.
 *
 * Subscription Criteria: DiagnosticReport?status=preliminary
 */
export async function handler(medplum: MedplumClient, event: BotEvent<DiagnosticReport>): Promise<Task> {
  const report = event.input;

  if (report.status !== 'preliminary') {
    throw new Error('Expected DiagnosticReport with status=preliminary');
  }

  // Extract the parsed data Binary reference from the extension
  const parsedDataRef = report.extension?.find(
    (ext) => ext.url === 'http://medplum.com/fhir/StructureDefinition/parsed-data-binary'
  )?.valueReference;

  // Extract the parsing provider name
  const parsingProvider = report.extension?.find(
    (ext) => ext.url === 'http://medplum.com/fhir/StructureDefinition/parsing-provider'
  )?.valueString;

  const resultCount = report.result?.length ?? 0;

  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'ready',
    intent: 'order',
    priority: 'routine',
    code: {
      coding: [
        {
          system: 'http://medplum.com/fhir/CodeSystem/task-type',
          code: 'review-parsed-report',
          display: 'Review Parsed Lab Report',
        },
      ],
      text: 'Review Parsed Lab Report',
    },
    description:
      `Review AI-extracted lab report (${resultCount} results) parsed by ${parsingProvider || 'unknown provider'}. ` +
      'Verify contained Observations are correct before finalizing.',
    focus: createReference(report),
    for: report.subject,
    input: [
      // Reference to the raw parsed JSON for comparison
      ...(parsedDataRef
        ? [
            {
              type: { text: 'parsedData' },
              valueReference: parsedDataRef as Reference,
            },
          ]
        : []),
      // Provider metadata
      ...(parsingProvider
        ? [
            {
              type: { text: 'parsingProvider' },
              valueString: parsingProvider,
            },
          ]
        : []),
      // Number of extracted results
      {
        type: { text: 'resultCount' },
        valueInteger: resultCount,
      },
    ],
    // Assign to a doctor queue for review
    performerType: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '158965000',
            display: 'Doctor',
          },
        ],
      },
    ],
  });

  console.log(`Created review Task/${task.id} for DiagnosticReport/${report.id}`);
  return task;
}
