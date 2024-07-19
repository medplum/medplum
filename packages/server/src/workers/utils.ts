import { createReference, getExtension, isResource, Operator } from '@medplum/core';
import {
  AuditEvent,
  AuditEventEntity,
  Bot,
  Coding,
  Practitioner,
  ProjectMembership,
  Reference,
  Resource,
  Subscription,
} from '@medplum/fhirtypes';
import { buildTracingExtension, getLogger } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { AuditEventOutcome } from '../util/auditevent';

export function findProjectMembership(project: string, profile: Reference): Promise<ProjectMembership | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
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
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param resource - The resource that triggered the subscription.
 * @param startTime - The time the subscription attempt started.
 * @param outcome - The outcome code.
 * @param outcomeDesc - The outcome description text.
 * @param subscription - Optional rest-hook subscription.
 * @param bot - Optional bot that was executed.
 */
export async function createAuditEvent(
  resource: Resource,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  subscription?: Subscription,
  bot?: Bot
): Promise<void> {
  const systemRepo = getSystemRepo();
  const auditedEvent = subscription ?? resource;

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
    entity: createAuditEventEntities(resource, subscription, bot),
    outcome,
    outcomeDesc,
    extension: buildTracingExtension(),
  });
}

export function createAuditEventEntities(...resources: unknown[]): AuditEventEntity[] {
  return resources.filter(isResource).map(createAuditEventEntity);
}

export function createAuditEventEntity(resource: Resource): AuditEventEntity {
  return {
    what: createReference(resource),
    role: getAuditEventEntityRole(resource),
  };
}

export function getAuditEventEntityRole(resource: Resource): Coding {
  switch (resource.resourceType) {
    case 'Patient':
      return { code: '1', display: 'Patient' };
    case 'Subscription':
      return { code: '9', display: 'Subscriber' };
    default:
      return { code: '4', display: 'Domain' };
  }
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
        getLogger().debug(
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
        getLogger().debug(
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
