// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block review-bot
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Resource, Subscription, Task } from '@medplum/fhirtypes';

// Application-defined workflow codes, not clinical terminology codes.
const workTypeSystem = 'https://example.com/CodeSystem/automation-work';
const followUpSystem = 'https://example.com/identifiers/preparation-review';

export async function handler(medplum: MedplumClient, event: BotEvent<Resource>): Promise<Task | undefined> {
  if (event.input.resourceType !== 'Task' || !event.input.id) {
    throw new Error('Expected a saved preparation Task');
  }
  return ensureReviewTask(medplum, event.input.id);
}

export async function ensureReviewTask(medplum: MedplumClient, sourceId: string): Promise<Task | undefined> {
  // The event may contain an older version. Check current eligibility.
  const source = await medplum.readResource('Task', sourceId, { cache: 'no-cache' });
  if (
    source.status !== 'completed' ||
    !source.code?.coding?.some((coding) => coding.system === workTypeSystem && coding.code === 'prepare-review')
  ) {
    return undefined;
  }
  if (!source.for?.reference?.startsWith('Patient/')) {
    throw new Error('Preparation Task must identify its patient in Task.for');
  }

  // One review per preparation Task. Repeated runs return the existing review
  // without resetting its status, assignee, or other progress.
  const identifier = { system: followUpSystem, value: sourceId };
  return medplum.createResourceIfNoneExist<Task>(
    {
      resourceType: 'Task',
      identifier: [identifier],
      status: 'ready',
      intent: 'order',
      code: { coding: [{ system: workTypeSystem, code: 'review' }] },
      focus: { reference: `Task/${sourceId}` },
      for: source.for,
    },
    new URLSearchParams({ identifier: `${identifier.system}|${identifier.value}` }).toString()
  );
}
// end-block review-bot

// start-block review-subscription
export function reviewSubscription(botId: string): Subscription {
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Create a review when preparation is completed',
    criteria: `Task?code=${workTypeSystem}|prepare-review&status=completed`,
    channel: { type: 'rest-hook', endpoint: `Bot/${botId}`, payload: 'application/fhir+json' },
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'create',
      },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'update',
      },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
        valueString: '%previous.id.exists() implies %previous.status != %current.status',
      },
    ],
  };
}
// end-block review-subscription

// start-block review-recovery
export async function recoverReviews(medplum: MedplumClient): Promise<void> {
  for await (const page of medplum.searchResourcePages('Task', {
    code: `${workTypeSystem}|prepare-review`,
    status: 'completed',
  })) {
    for (const source of page) {
      if (source.id) {
        await ensureReviewTask(medplum, source.id);
      }
    }
  }
}
// end-block review-recovery
