// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource } from '@medplum/core';
import { append, createReference, flatMapFilter, isResource, isResourceWithId, resolveId } from '@medplum/core';
import type {
  AuditEvent,
  AuditEventAgentNetwork,
  AuditEventEntity,
  Bot,
  Coding,
  Extension,
  Practitioner,
  Project,
  Reference,
  Resource,
  Subscription,
} from '@medplum/fhirtypes';
import type { BotExecutionRequest } from '../bots/types';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, buildTracingExtension, tryGetRequestContext } from '../context';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';

/*
 * This file includes a collection of utility functions for working with AuditEvents.
 *
 * AuditEvent is a versatile resource that can be used to record a variety of events.
 * However, for core logging, we want to use a consistent set of event types.
 * This file includes a collection of best practices derived from examples from the HL7 FHIR website.
 */

/**
 * DICOM code system.
 * See: https://dicom.nema.org/medical/dicom/current/output/chtml/part16/chapter_D.html
 */
export const DicomCodeSystem = 'http://dicom.nema.org/resources/ontology/DCM';

/**
 * AuditEvent type code system.
 * See: https://www.hl7.org/fhir/valueset-audit-event-type.html
 */
export const AuditEventTypeCodeSystem = 'http://terminology.hl7.org/CodeSystem/audit-event-type';

/**
 * RESTful operation code system.
 * See: https://hl7.org/fhir/codesystem-restful-interaction.html
 */
export const RestfulActionCodeSystem = 'http://hl7.org/fhir/restful-interaction';

/**
 * User authentication event type.
 * See examples:
 * Login: https://www.hl7.org/fhir/audit-event-example-login.json.html
 * Logout: https://www.hl7.org/fhir/audit-event-example-logout.json.html
 */
export const UserAuthenticationEvent: Coding = {
  system: DicomCodeSystem,
  code: '110114',
  display: 'User Authentication',
};

/**
 * RESTful operation event type.
 * See examples:
 * vread: https://www.hl7.org/fhir/audit-event-example-vread.json.html
 */
export const RestfulOperationType: Coding = {
  system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
  code: 'rest',
  display: 'Restful Operation',
};

/*
 * UserAuthentication subtypes.
 * See: https://dicom.nema.org/medical/dicom/current/output/chtml/part16/chapter_D.html
 */

export const LoginEvent = { system: DicomCodeSystem, code: '110122', display: 'Login' } as const;
export const LogoutEvent = { system: DicomCodeSystem, code: '110123', display: 'Logout' } as const;

/*
 * Restful interactions.
 * See: https://hl7.org/fhir/codesystem-restful-interaction.html
 */
export const RestfulInteractions = {
  read: { system: RestfulActionCodeSystem, code: 'read', display: 'read' },
};

export const ReadInteraction = { system: RestfulActionCodeSystem, code: 'read', display: 'read' } as const;
export const VreadInteraction = { system: RestfulActionCodeSystem, code: 'vread', display: 'vread' } as const;
export const UpdateInteraction = { system: RestfulActionCodeSystem, code: 'update', display: 'update' } as const;
export const PatchInteraction = { system: RestfulActionCodeSystem, code: 'patch', display: 'patch' } as const;
export const DeleteInteraction = { system: RestfulActionCodeSystem, code: 'delete', display: 'delete' } as const;
export const HistoryInteraction = { system: RestfulActionCodeSystem, code: 'history', display: 'history' } as const;
export const CreateInteraction = { system: RestfulActionCodeSystem, code: 'create', display: 'create' } as const;
export const SearchInteraction = { system: RestfulActionCodeSystem, code: 'search', display: 'search' } as const;
export const BatchInteraction = { system: RestfulActionCodeSystem, code: 'batch', display: 'batch' } as const;
export const TransactionInteraction = {
  system: RestfulActionCodeSystem,
  code: 'transaction',
  display: 'transaction',
} as const;
export const OperationInteraction = {
  system: RestfulActionCodeSystem,
  code: 'operation',
  display: 'operation',
} as const;

/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
export type AuditEventType = typeof UserAuthenticationEvent | typeof RestfulOperationType;

export type AuditEventSubtype =
  | typeof LoginEvent
  | typeof LogoutEvent
  | typeof ReadInteraction
  | typeof VreadInteraction
  | typeof UpdateInteraction
  | typeof PatchInteraction
  | typeof DeleteInteraction
  | typeof HistoryInteraction
  | typeof CreateInteraction
  | typeof SearchInteraction
  | typeof TransactionInteraction
  | typeof BatchInteraction
  | typeof OperationInteraction;
/* eslint-enable @typescript-eslint/no-duplicate-type-constituents */

/**
 * AuditEvent action code.
 * See: https://www.hl7.org/fhir/valueset-audit-event-action.html
 */
export const AuditEventAction = {
  Create: 'C',
  Read: 'R',
  Update: 'U',
  Delete: 'D',
  Execute: 'E',
} as const;
export type AuditEventAction = (typeof AuditEventAction)[keyof typeof AuditEventAction];

const AuditEventActionLookup: Record<AuditEventSubtype['code'], AuditEventAction | undefined> = {
  create: 'C',
  read: 'R',
  vread: 'R',
  history: 'R',
  search: 'R',
  update: 'U',
  patch: 'U',
  delete: 'D',
  batch: undefined,
  transaction: undefined,
  operation: undefined,
  110122: undefined,
  110123: undefined,
};

/**
 * AuditEvent outcome code.
 * See: https://www.hl7.org/fhir/valueset-audit-event-outcome.html
 */
export const AuditEventOutcome = {
  Success: '0',
  MinorFailure: '4',
  SeriousFailure: '8',
  MajorFailure: '12',
} as const;
export type AuditEventOutcome = (typeof AuditEventOutcome)[keyof typeof AuditEventOutcome];

export function createAuditEvent(
  type: AuditEventType,
  subtype: AuditEventSubtype,
  projectId: string,
  who: Reference | undefined,
  remoteAddress: string | undefined,
  outcome: AuditEventOutcome,
  options?: {
    description?: string;
    resource?: Resource | Reference;
    searchQuery?: string;
    durationMs?: number;
  }
): AuditEvent {
  const config = getConfig();

  let entity: AuditEventEntity[] | undefined = undefined;
  if (options?.resource) {
    const what: Reference = isResource(options.resource) ? createReference(options.resource) : options.resource;
    entity = [{ what: applyOptionalRedaction(what) }];
  } else if (options?.searchQuery) {
    entity = [{ query: options.searchQuery }];
  }

  let network: AuditEventAgentNetwork | undefined = undefined;
  if (remoteAddress) {
    network = { address: remoteAddress, type: '2' };
  }

  let extension: Extension[] | undefined;
  const tracingExt = buildTracingExtension();
  if (tracingExt) {
    extension = append(extension, tracingExt);
  }
  if (options?.durationMs) {
    extension = append(extension, buildDurationExtension(options.durationMs));
  }

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: { project: projectId },
    type,
    subtype: [subtype],
    action: AuditEventActionLookup[subtype.code],
    recorded: new Date().toISOString(),
    source: { observer: { identifier: { value: config.baseUrl } } },
    agent: [
      {
        who: applyOptionalRedaction(who) as Reference<Practitioner>,
        requestor: true,
        network,
      },
    ],
    outcome,
    outcomeDesc: options?.description,
    entity,
    extension,
  };

  return auditEvent;
}

export function logAuditEvent(auditEvent: AuditEvent): void {
  const config = getConfig();
  if (config.logAuditEvents) {
    console.log(JSON.stringify(auditEvent));
  }
}

function buildDurationExtension(duration: number): Extension {
  return {
    url: 'https://medplum.com/fhir/StructureDefinition/durationMs',
    valueInteger: Math.round(duration),
  };
}

export function applyOptionalRedaction(ref: Reference | undefined): Reference | undefined {
  const config = getConfig();
  const ctx = tryGetRequestContext();
  let project: Project | undefined;
  if (ctx instanceof AuthenticatedRequestContext) {
    project = ctx.project;
  }
  if (config.redactAuditEvents || project?.setting?.find((s) => s.name === 'redactAuditEvents')?.valueBoolean) {
    return { ...ref, display: undefined };
  } else {
    return ref;
  }
}

const defaultBotOutputLength = 10 * 1024; // 10 KiB

/**
 * Creates an AuditEvent for a Bot execution.
 * @param request - The bot request.
 * @param startTime - The time the execution attempt started.
 * @param outcome - The outcome code.
 * @param outcomeDesc - The outcome description text.
 */
export async function createBotAuditEvent(
  request: BotExecutionRequest,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc: string
): Promise<void> {
  const { bot, runAs, requester, input, subscription, agent, device } = request;
  const trigger = bot.auditEventTrigger ?? 'always';
  if (
    trigger === 'never' ||
    (trigger === 'on-error' && outcome === AuditEventOutcome.Success) ||
    (trigger === 'on-output' && outcomeDesc.length === 0)
  ) {
    return;
  }

  let extension: Extension[] | undefined;
  const tracingExt = buildTracingExtension();
  if (tracingExt) {
    extension = append(extension, tracingExt);
  }
  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: resolveId(runAs.project) as string,
      account: bot.meta?.account,
      accounts: bot.meta?.accounts,
    },
    period: {
      start: startTime,
      end: new Date().toISOString(),
    },
    recorded: new Date().toISOString(),
    type: { system: 'https://medplum.com/CodeSystem/audit-event', code: 'execute' },
    agent: [
      {
        who: applyOptionalRedaction(requester) as Reference<ProfileResource>,
        requestor: true,
      },
      {
        who: applyOptionalRedaction(runAs.profile) as Reference<ProfileResource>,
        requestor: false,
      },
    ],
    source: { observer: applyOptionalRedaction(createReference(bot)) as Reference<Bot> },
    entity: createAuditEventEntities(bot, input, subscription, agent, device),
    outcome,
    outcomeDesc,
    extension,
  };

  const config = getConfig();
  for (const destination of bot.auditEventDestination ?? ['resource']) {
    switch (destination) {
      case 'resource': {
        const systemRepo = getProjectSystemRepo(runAs.project);
        await systemRepo.createResource<AuditEvent>({
          ...auditEvent,
          outcomeDesc: tail(outcomeDesc, config.maxBotLogLengthForResource ?? defaultBotOutputLength),
        });
        break;
      }
      case 'log':
        logAuditEvent({
          ...auditEvent,
          outcomeDesc: tail(outcomeDesc, config.maxBotLogLengthForLogs ?? defaultBotOutputLength),
        });
        break;
    }
  }
}

function tail(str: string, n: number): string {
  return str.substring(str.length - n);
}

const SUBSCRIPTION_AUDIT_EVENT_DESTINATION_URL =
  'https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination';

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param systemRepo - The system repository.
 * @param resource - The resource that triggered the subscription.
 * @param startTime - The time the subscription attempt started.
 * @param outcome - The outcome code.
 * @param outcomeDesc - The outcome description text.
 * @param subscription - Optional rest-hook subscription.
 * @param bot - Optional bot that was executed.
 */
export async function createSubscriptionAuditEvent(
  systemRepo: SystemRepository,
  resource: Resource,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  subscription?: Subscription,
  bot?: Bot
): Promise<void> {
  const auditedEvent = subscription ?? resource;

  let extension: Extension[] | undefined;
  const tracingExt = buildTracingExtension();
  if (tracingExt) {
    extension = append(extension, tracingExt);
  }
  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: auditedEvent.meta?.project,
      account: auditedEvent.meta?.account,
      accounts: auditedEvent.meta?.accounts,
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
        type: { text: auditedEvent.resourceType },
        requestor: false,
      },
    ],
    source: {
      observer: applyOptionalRedaction(createReference(auditedEvent)) as Reference as Reference<Practitioner>,
    },
    entity: createAuditEventEntities(resource, subscription, bot),
    outcome,
    outcomeDesc,
    extension,
  };

  // Read destination extensions from subscription
  const destinations: string[] = [];
  if (subscription?.extension) {
    for (const ext of subscription.extension) {
      if (ext.url === SUBSCRIPTION_AUDIT_EVENT_DESTINATION_URL && ext.valueCode) {
        destinations.push(ext.valueCode);
      }
    }
  }

  // Default to 'resource' if no extensions found
  const finalDestinations = destinations.length > 0 ? destinations : ['resource'];

  // Process each destination
  for (const destination of finalDestinations) {
    switch (destination) {
      case 'resource':
        await systemRepo.createResource<AuditEvent>(auditEvent);
        break;
      case 'log':
        logAuditEvent(auditEvent);
        break;
    }
  }
}

export function createAuditEventEntities(...resources: unknown[]): AuditEventEntity[] {
  return flatMapFilter(resources, (v) => (isResourceWithId(v) ? createAuditEventEntity(v) : undefined));
}

export function createAuditEventEntity(resource: Resource): AuditEventEntity {
  return {
    what: applyOptionalRedaction(createReference(resource)),
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
