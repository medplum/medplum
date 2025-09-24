// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { append, createReference, isResource } from '@medplum/core';
import {
  AuditEvent,
  AuditEventAgentNetwork,
  AuditEventEntity,
  Coding,
  Extension,
  Practitioner,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { buildTracingExtension } from '../context';
import { CloudWatchLogger } from './cloudwatch';

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
    entity = [{ what }];
  } else if (options?.searchQuery) {
    entity = [{ query: options.searchQuery }];
  }

  let network: AuditEventAgentNetwork | undefined = undefined;
  if (remoteAddress) {
    network = { address: remoteAddress, type: '2' };
  }

  let extension = buildTracingExtension();
  if (options?.durationMs) {
    extension = append(extension, buildDurationExtension(options.durationMs));
  }

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: projectId,
    },
    type,
    subtype: [subtype],
    action: AuditEventActionLookup[subtype.code as keyof typeof AuditEventActionLookup],
    recorded: new Date().toISOString(),
    source: { observer: { identifier: { value: config.baseUrl } } },
    agent: [
      {
        who: who as Reference<Practitioner>,
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
    if (config.auditEventLogGroup) {
      getCloudWatchLogger(config).write(JSON.stringify(auditEvent));
    } else {
      console.log(JSON.stringify(auditEvent));
    }
  }
}

function buildDurationExtension(duration: number): Extension {
  return {
    url: 'https://medplum.com/fhir/StructureDefinition/durationMs',
    valueInteger: Math.round(duration),
  };
}

/** @deprecated */
let cloudWatchLogger: CloudWatchLogger | undefined = undefined;

/**
 * @param config - The server config.
 * @returns The CloudWatch logger.
 * @deprecated
 */
function getCloudWatchLogger(config: MedplumServerConfig): CloudWatchLogger {
  if (!cloudWatchLogger) {
    cloudWatchLogger = cloudWatchLogger = new CloudWatchLogger(
      config.awsRegion,
      config.auditEventLogGroup as string,
      config.auditEventLogStream
    );
  }
  return cloudWatchLogger;
}
