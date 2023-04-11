import {
  AuditEvent,
  Bot,
  Practitioner,
  ProjectMembership,
  Reference,
  Resource,
  Subscription,
} from '@medplum/fhirtypes';
import { systemRepo } from '../fhir/repo';
import { createReference, Operator } from '@medplum/core';
import { AuditEventOutcome } from '../util/auditevent';

export async function findProjectMembership(
  project: string,
  profile: Reference
): Promise<ProjectMembership | undefined> {
  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: `Project/${project}`,
      },
      {
        code: 'profile',
        operator: Operator.EQUALS,
        value: profile.reference as string,
      },
    ],
  });
  return bundle.entry?.[0]?.resource;
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param resource The resource that triggered the subscription.
 * @param startTime The time the subscription attempt started.
 * @param outcome The outcome code.
 * @param outcomeDesc The outcome description text.
 * @param subscription Optional rest-hook subscription.
 * @param bot Optional bot that was executed.
 */
export async function createAuditEvent(
  resource: Resource,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  subscription?: Subscription,
  bot?: Bot
): Promise<void> {
  const entity = [
    {
      what: createReference(resource),
      role: { code: '4', display: 'Domain' },
    },
  ];

  if (subscription) {
    entity.push({
      what: createReference(subscription),
      role: { code: '9', display: 'Subscriber' },
    });
  }

  if (bot) {
    entity.push({
      what: createReference(bot),
      role: { code: '9', display: 'Subscriber' },
    });
  }

  const auditedEvent = subscription ? subscription : resource;

  await systemRepo.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    meta: {
      project: auditedEvent.meta?.project,
      account: auditedEvent.meta?.account,
    },
    period: {
      start: startTime,
      end: new Date().toISOString(),
    },
    recorded: new Date().toISOString(),
    type: {
      code: 'transmit',
    },
    agent: [
      {
        type: {
          text: auditedEvent.resourceType,
        },
        requestor: false,
      },
    ],
    source: {
      // Observer cannot be a resource
      // observer: createReference(auditedEvent)
      observer: createReference(auditedEvent) as Reference as Reference<Practitioner>,
    },
    entity,
    outcome,
    outcomeDesc,
  });
}

export function findMaxJobAttemps(subscription: Subscription): number {
  for (const ext of subscription.extension || []) {
    if (ext.url === 'maxAttempts') {
      if (!!ext.valueInteger && ext.valueInteger > 0) {
        return ext.valueInteger;
      }
    }
  }
  return 18;
}
