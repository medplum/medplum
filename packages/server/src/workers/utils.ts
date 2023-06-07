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
import { createReference, getExtension, Operator } from '@medplum/core';
import { AuditEventOutcome } from '../util/auditevent';
import { logger } from '../logger';

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

export function shouldTriggerJob(subscription: Subscription): boolean {
  const criteria = getExtension(subscription, 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria')
  if (!criteria) {
    return true;
  }

  let previous = '';
  let next; 
  
  if (!previous) {
    return true;
  }
  if (previous !== next) {
    return true;
  }
  
  return false;
}

export function isJobSuccessful(subscription: Subscription, status: number): boolean {
  const successCodes = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/subscription-success-codes'
  );

  if (!successCodes?.valueString) {
    return defaultStatusCheck(status);
  }

  // Removing any white space
  const codesTrimSpace = successCodes.valueString.replace(/ /g, '');
  const listOfSuccessCodes = codesTrimSpace.split(',');

  for (const code of listOfSuccessCodes) {
    if (code.includes('-')) {
      const codeRange = code.split('-');
      const lowerBound = Number(codeRange[0]);
      const upperBound = Number(codeRange[1]);
      if (!(Number.isInteger(lowerBound) && Number.isInteger(upperBound))) {
        logger.debug(
          `${lowerBound} and ${upperBound} aren't an integer, configured status codes need to be changed. Resorting to default codes`
        );
        return defaultStatusCheck(status);
      }
      if (status >= lowerBound && status <= upperBound) {
        return true;
      }
    } else {
      const codeValue = Number(code);
      if (!Number.isInteger(codeValue)) {
        logger.debug(
          `${code} isn't an integer, configured status codes need to be changed. Resorting to default codes`
        );
        return defaultStatusCheck(status);
      }
      if (status === Number(code)) {
        return true;
      }
    }
  }
  return false;
}

function defaultStatusCheck(status: number): boolean {
  return status >= 200 && status < 400;
}