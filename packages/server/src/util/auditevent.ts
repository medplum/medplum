import { createReference } from '@medplum/core';
import {
  AuditEvent,
  AuditEventAgentNetwork,
  AuditEventEntity,
  Coding,
  Practitioner,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { MedplumServerConfig, getConfig } from '../config';
import { CloudWatchLogger } from './cloudwatch';
import { buildTracingExtension } from '../context';

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

export const LoginEvent: Coding = { system: DicomCodeSystem, code: '110122', display: 'Login' };
export const LogoutEvent: Coding = { system: DicomCodeSystem, code: '110123', display: 'Logout' };

/*
 * Restful interactions.
 * See: https://hl7.org/fhir/codesystem-restful-interaction.html
 */
export const RestfulInteractions = {
  read: { system: RestfulActionCodeSystem, code: 'read', display: 'read' },
};

export const ReadInteraction: Coding = { system: RestfulActionCodeSystem, code: 'read', display: 'read' };
export const VreadInteraction: Coding = { system: RestfulActionCodeSystem, code: 'vread', display: 'vread' };
export const UpdateInteraction: Coding = { system: RestfulActionCodeSystem, code: 'update', display: 'update' };
export const PatchInteraction: Coding = { system: RestfulActionCodeSystem, code: 'patch', display: 'patch' };
export const DeleteInteraction: Coding = { system: RestfulActionCodeSystem, code: 'delete', display: 'delete' };
export const HistoryInteraction: Coding = { system: RestfulActionCodeSystem, code: 'history', display: 'history' };
export const CreateInteraction: Coding = { system: RestfulActionCodeSystem, code: 'create', display: 'create' };
export const SearchInteraction: Coding = { system: RestfulActionCodeSystem, code: 'search', display: 'search' };
export const BatchInteraction: Coding = { system: RestfulActionCodeSystem, code: 'batch', display: 'batch' };
export const TransactionInteraction: Coding = {
  system: RestfulActionCodeSystem,
  code: 'transaction',
  display: 'transaction',
};
export const OperationInteraction: Coding = {
  system: RestfulActionCodeSystem,
  code: 'operation',
  display: 'operation',
};

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
export enum AuditEventAction {
  Create = 'C',
  Read = 'R',
  Update = 'U',
  Delete = 'D',
  Execute = 'E',
}

const AuditEventActionLookup: Record<string, 'C' | 'R' | 'U' | 'D' | 'E'> = {
  create: 'C',
  read: 'R',
  vread: 'R',
  history: 'R',
  search: 'R',
  update: 'U',
};

/**
 * AuditEvent outcome code.
 * See: https://www.hl7.org/fhir/valueset-audit-event-outcome.html
 */
export enum AuditEventOutcome {
  Success = '0',
  MinorFailure = '4',
  SeriousFailure = '8',
  MajorFailure = '12',
}

export function logAuthEvent(
  subtype: AuditEventSubtype,
  projectId: string,
  who: Reference | undefined,
  remoteAddress: string | undefined,
  outcome: AuditEventOutcome,
  outcomeDesc?: string
): AuditEvent {
  const auditEvent = createAuditEvent(
    UserAuthenticationEvent,
    subtype,
    projectId,
    who,
    remoteAddress,
    outcome,
    outcomeDesc
  );
  logAuditEvent(auditEvent);
  return auditEvent;
}

export function logRestfulEvent(
  subtype: AuditEventSubtype,
  projectId: string,
  who: Reference | undefined,
  remoteAddress: string | undefined,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  resource?: Resource,
  searchQuery?: string
): AuditEvent {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    subtype,
    projectId,
    who,
    remoteAddress,
    outcome,
    outcomeDesc,
    resource,
    searchQuery
  );
  logAuditEvent(auditEvent);
  return auditEvent;
}

function createAuditEvent(
  type: AuditEventType,
  subtype: AuditEventSubtype,
  projectId: string,
  who: Reference | undefined,
  remoteAddress: string | undefined,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  resource?: Resource,
  searchQuery?: string
): AuditEvent {
  const config = getConfig();

  let entity: AuditEventEntity[] | undefined = undefined;
  if (resource) {
    entity = [{ what: createReference(resource) }];
  }
  if (searchQuery) {
    entity = [{ query: searchQuery }];
  }

  let network: AuditEventAgentNetwork | undefined = undefined;
  if (remoteAddress) {
    network = { address: remoteAddress, type: '2' };
  }

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: projectId,
    },
    type,
    subtype: [subtype],
    action: AuditEventActionLookup[subtype.code as string],
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
    outcomeDesc,
    entity,
    extension: buildTracingExtension(),
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
