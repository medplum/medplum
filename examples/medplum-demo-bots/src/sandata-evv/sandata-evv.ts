// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getCodeBySystem, getIdentifier } from '@medplum/core';
import type {
  CodeableConcept,
  Encounter,
  Location,
  Organization,
  Patient,
  Practitioner,
  Provenance,
  Resource,
  Task,
} from '@medplum/fhirtypes';

/*
 * Mapping from the Medplum home care visit model to Sandata's alternate EVV ("Open EVV") interface.
 *
 * Field names, formats, and processing rules follow Sandata's published alternate EVV specifications for
 * Indiana (Specification User Guide v1.2), Connecticut (DSS Specification User Guide v1.1 and DDS Vendor
 * Specification v1.1), and Rhode Island (RI-EOHHS Alt EVV Specification v4.1). Where the states differ,
 * the difference is a field in SandataConfig. See submit-visit-to-sandata.ts for the assumptions this makes.
 */

/** Configuration for one Sandata implementation (state + payer program). Values differ by state. */
export interface SandataConfig {
  /** ProviderQualifier (for example "MedicaidID", or "Other" in Rhode Island), and the Organization.identifier system. */
  readonly provider: { readonly qualifier: string; readonly identifierSystem: string };
  /**
   * ClientQualifier on the client record (for example "ClientMedicaidID"), ClientIDQualifier on the visit record
   * (Rhode Island uses "ClientOtherID" there), and the Patient.identifier system.
   */
  readonly client: { readonly qualifier: string; readonly visitQualifier: string; readonly identifierSystem: string };
  /**
   * EmployeeQualifier (for example "EmployeeSSN" or "EmployeeCustomID") and the Practitioner.identifier system.
   * maskSsn sends only the last 5 digits of an SSN with 4 leading zeros (Rhode Island and Connecticut).
   */
  readonly employee: { readonly qualifier: string; readonly identifierSystem: string; readonly maskSsn?: boolean };
  /** Sandata timezone name for clients and visits, for example "US/Eastern". */
  readonly timeZone: string;
  /** Billing codes for each visit type, keyed by the code of an Encounter.type coding in serviceCodeSystem. */
  readonly serviceCodeSystem: string;
  readonly services: Readonly<Record<string, SandataService>>;
  /** Sandata TaskID for each care task, keyed by the code of a Task.code coding in taskCodeSystem. */
  readonly taskCodeSystem: string;
  readonly taskIds: Readonly<Record<string, string>>;
  /** The CodeSystem of the state's visit change reason codes, used in Provenance.reason. */
  readonly reasonCodeSystem: string;
  /** The CodeSystem of the Location.type coding that marks a clock-in or clock-out. */
  readonly visitEventSystem: string;
}

export interface SandataService {
  readonly payerId: string;
  readonly payerProgram: string;
  readonly procedureCode: string;
  readonly modifiers?: readonly string[];
}

/** Everything about one visit that the records are built from. */
export interface VisitContext {
  readonly encounter: Encounter;
  readonly agency: Organization;
  readonly patient: Patient;
  readonly caregiver: Practitioner;
  /** The Locations referenced from Encounter.location, in the same order. */
  readonly locations: readonly Location[];
  readonly tasks: readonly Task[];
  /** Provenance resources recording corrections to the Encounter. */
  readonly corrections: readonly Provenance[];
}

// The Sandata record types. Only fields common to the three specifications are included, because Sandata rejects a
// transmission that contains a field name it doesn't recognize for that implementation.

interface ProviderIdentification {
  ProviderQualifier: string;
  ProviderID: string;
}

export interface SandataEmployee {
  ProviderIdentification: ProviderIdentification;
  EmployeeQualifier: string;
  EmployeeIdentifier: string;
  EmployeeOtherID: string;
  SequenceID: number;
  EmployeeLastName: string;
  EmployeeFirstName: string;
  EmployeeEmail: string | null;
}

export interface SandataClient {
  ProviderIdentification: ProviderIdentification;
  ClientQualifier: string;
  ClientIdentifier: string;
  ClientMedicaidID: string;
  ClientOtherID: string;
  SequenceID: number;
  ClientFirstName: string;
  ClientMiddleInitial: string | null;
  ClientLastName: string;
  ClientTimeZone: string;
  ClientAddress: {
    ClientAddressType: 'Home';
    ClientAddressIsPrimary: boolean;
    ClientAddressLine1: string;
    ClientAddressLine2: string | null;
    ClientCity: string;
    ClientState: string;
    ClientZip: string;
  }[];
}

export interface SandataVisit {
  ProviderIdentification: ProviderIdentification;
  VisitOtherID: string;
  SequenceID: number;
  EmployeeQualifier: string;
  EmployeeOtherID: string;
  EmployeeIdentifier: string;
  ClientIDQualifier: string;
  ClientID: string;
  ClientOtherID: string;
  VisitCancelledIndicator: boolean;
  PayerID: string;
  PayerProgram: string;
  ProcedureCode: string;
  Modifier1: string | null;
  Modifier2: string | null;
  Modifier3: string | null;
  Modifier4: string | null;
  VisitTimeZone: string;
  AdjInDateTime: string | null;
  AdjOutDateTime: string | null;
  BillVisit: boolean;
  Calls: {
    CallExternalID: string;
    CallDateTime: string;
    CallAssignment: 'Time In' | 'Time Out';
    CallType: 'Mobile' | 'Manual';
    ProcedureCode: string;
    MobileLogin: string | null;
    CallLatitude: number | null;
    CallLongitude: number | null;
  }[];
  VisitChanges?: {
    SequenceID: number;
    ChangeMadeBy: string;
    ChangeDateTime: string;
    ReasonCode: string;
    ChangeReasonMemo: string | null;
  }[];
  Tasks?: { TaskID: string; TaskRefused: boolean }[];
}

export interface SandataRecords {
  employees: SandataEmployee;
  clients: SandataClient;
  visits: SandataVisit;
}

export interface BuildOptions {
  /** The SequenceID for the employee and client records. */
  readonly sequenceId: number;
  /** The SequenceID for the visit record, which must be higher than any previously sent for this visit. */
  readonly visitSequenceId: number;
  /** Whether Sandata already accepted an earlier transmission of this visit. */
  readonly isUpdate: boolean;
}

/**
 * Builds a SequenceID from a time, as YYYYMMDDHHMMSS in UTC.
 *
 * Sandata keeps, for each client, employee, and visit, the record with the highest SequenceID it has received.
 * A record with a lower SequenceID is stored as history; one with an equal SequenceID is rejected as a duplicate.
 * @param date - The time of the transmission.
 * @param previous - The SequenceID last sent for this record, if any. The result is always greater.
 * @returns The SequenceID.
 */
export function toSequenceId(date: Date, previous?: number): number {
  const stamp = Number(date.toISOString().slice(0, 19).replace(/\D/g, ''));
  return previous !== undefined && stamp <= previous ? previous + 1 : stamp;
}

/**
 * Builds the employee, client, and visit records for one visit.
 * @param config - The Sandata configuration.
 * @param context - The visit.
 * @param options - SequenceIDs, and whether this is an update to an accepted visit.
 * @returns The records, keyed by Sandata record type.
 */
export function buildRecords(config: SandataConfig, context: VisitContext, options: BuildOptions): SandataRecords {
  const { encounter, agency, patient, caregiver } = context;
  const provider: ProviderIdentification = {
    ProviderQualifier: config.provider.qualifier,
    ProviderID: requireIdentifier(agency, config.provider.identifierSystem),
  };
  const clientId = requireIdentifier(patient, config.client.identifierSystem);
  const caregiverId = requireIdentifier(caregiver, config.employee.identifierSystem);
  const employeeId = config.employee.maskSsn ? `0000${caregiverId.replace(/\D/g, '').slice(-5)}` : caregiverId;

  const address = patient.address?.find((a) => a.use === 'home') ?? patient.address?.[0];
  if (!address?.line?.[0] || !address.city || !address.state || !address.postalCode) {
    throw new Error(`Patient/${patient.id} needs a complete address (line, city, state, and ZIP)`);
  }

  const serviceCode = findCode(encounter.type, config.serviceCodeSystem);
  const service = serviceCode ? config.services[serviceCode] : undefined;
  if (!service) {
    throw new Error(`Encounter/${encounter.id} has no Encounter.type mapped to a Sandata service`);
  }

  const calls = buildCalls(config, context, service);

  // Calls keep the originally captured times. If Encounter.period was corrected afterwards, the corrected times are
  // sent as adjusted times, which supersede the calls.
  const adjIn = adjustedTime(encounter.period?.start, calls, 'Time In');
  const adjOut = adjustedTime(encounter.period?.end, calls, 'Time Out');

  // Manual calls, adjusted times, and every update to an accepted visit must say who changed it and why
  const needsChanges = options.isUpdate || !!adjIn || !!adjOut || calls.some((c) => c.CallType === 'Manual');

  const tasks = context.tasks.flatMap((t) => {
    const code = t.status === 'completed' ? findCode([t.code], config.taskCodeSystem) : undefined;
    const taskId = code && config.taskIds[code];
    return taskId ? [{ TaskID: taskId, TaskRefused: false }] : [];
  });

  const name = { patient: patient.name?.[0], caregiver: caregiver.name?.[0] };
  return {
    employees: {
      ProviderIdentification: provider,
      EmployeeQualifier: config.employee.qualifier,
      EmployeeIdentifier: employeeId,
      EmployeeOtherID: employeeId,
      SequenceID: options.sequenceId,
      EmployeeLastName: name.caregiver?.family ?? '',
      EmployeeFirstName: name.caregiver?.given?.[0] ?? '',
      EmployeeEmail: caregiver.telecom?.find((t) => t.system === 'email')?.value ?? null,
    },
    clients: {
      ProviderIdentification: provider,
      ClientQualifier: config.client.qualifier,
      ClientIdentifier: clientId,
      ClientMedicaidID: clientId,
      ClientOtherID: clientId,
      SequenceID: options.sequenceId,
      ClientFirstName: name.patient?.given?.[0] ?? '',
      ClientMiddleInitial: name.patient?.given?.[1]?.charAt(0) ?? null,
      ClientLastName: name.patient?.family ?? '',
      ClientTimeZone: config.timeZone,
      ClientAddress: [
        {
          ClientAddressType: 'Home',
          ClientAddressIsPrimary: true,
          ClientAddressLine1: address.line[0],
          ClientAddressLine2: address.line[1] ?? null,
          ClientCity: address.city,
          ClientState: address.state,
          // A 9-digit ZIP, padded with zeros when the +4 is unknown
          ClientZip: address.postalCode.replace(/\D/g, '').padEnd(9, '0').slice(0, 9),
        },
      ],
    },
    visits: {
      ProviderIdentification: provider,
      VisitOtherID: toSandataId(encounter.id as string, 50),
      SequenceID: options.visitSequenceId,
      EmployeeQualifier: config.employee.qualifier,
      EmployeeOtherID: employeeId,
      EmployeeIdentifier: employeeId,
      ClientIDQualifier: config.client.visitQualifier,
      ClientID: clientId,
      ClientOtherID: clientId,
      VisitCancelledIndicator: false,
      PayerID: service.payerId,
      PayerProgram: service.payerProgram,
      ProcedureCode: service.procedureCode,
      Modifier1: service.modifiers?.[0] ?? null,
      Modifier2: service.modifiers?.[1] ?? null,
      Modifier3: service.modifiers?.[2] ?? null,
      Modifier4: service.modifiers?.[3] ?? null,
      VisitTimeZone: config.timeZone,
      AdjInDateTime: adjIn,
      AdjOutDateTime: adjOut,
      // A visit with calls can't be deleted in Sandata; a visit voided in Medplum is sent as not billable instead
      BillVisit: encounter.status !== 'cancelled' && encounter.status !== 'entered-in-error',
      Calls: calls,
      VisitChanges: needsChanges ? buildVisitChanges(config, context, options.visitSequenceId) : undefined,
      Tasks: tasks.length > 0 ? tasks : undefined,
    },
  };
}

/**
 * Builds a call for each clock-in and clock-out entry in Encounter.location. A call with GPS coordinates is "Mobile";
 * one without (GPS unavailable, or entered by hand) is "Manual".
 * @param config - The Sandata configuration.
 * @param context - The visit.
 * @param service - The visit's billing codes.
 * @returns The calls.
 */
function buildCalls(config: SandataConfig, context: VisitContext, service: SandataService): SandataVisit['Calls'] {
  return (context.encounter.location ?? []).flatMap((entry, i) => {
    const location = context.locations[i];
    const event = findCode(location?.type, config.visitEventSystem);
    const time = entry.period?.start;
    if (!location?.id || (event !== 'clock-in' && event !== 'clock-out') || !time) {
      return [];
    }
    const position = location.position;
    return [
      {
        CallExternalID: toSandataId(location.id, 16),
        CallDateTime: toSandataDateTime(time),
        CallAssignment: event === 'clock-in' ? 'Time In' : 'Time Out',
        CallType: position ? 'Mobile' : 'Manual',
        ProcedureCode: service.procedureCode,
        MobileLogin: position ? toSandataId(context.caregiver.id as string, 64) : null,
        CallLatitude: position?.latitude ?? null,
        CallLongitude: position?.longitude ?? null,
      },
    ];
  });
}

/**
 * Builds VisitChanges from the Provenance resources that record corrections to the Encounter.
 * @param config - The Sandata configuration.
 * @param context - The visit.
 * @param sequenceId - The SequenceID of the visit transmission that carries the changes.
 * @returns One change per Provenance with a reason code.
 */
function buildVisitChanges(
  config: SandataConfig,
  context: VisitContext,
  sequenceId: number
): NonNullable<SandataVisit['VisitChanges']> {
  const changes = context.corrections.flatMap((provenance) => {
    const reason = provenance.reason?.find((r) => getCodeBySystem(r, config.reasonCodeSystem));
    if (!reason) {
      return [];
    }
    return [
      {
        SequenceID: sequenceId,
        // A person, not "system": at most 64 characters, without special characters
        ChangeMadeBy: (provenance.agent[0]?.who?.display ?? '').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 64),
        ChangeDateTime: toSandataDateTime(provenance.recorded),
        ReasonCode: getCodeBySystem(reason, config.reasonCodeSystem) as string,
        ChangeReasonMemo: reason.text?.slice(0, 256) ?? null,
      },
    ];
  });
  if (changes.length === 0) {
    throw new Error(
      `Encounter/${context.encounter.id} has manual or corrected times, or is an update to a submitted visit, ` +
        'but no Provenance with a reason code explains the change'
    );
  }
  return changes;
}

/**
 * Returns the corrected time if it differs from the captured call time, or null if it doesn't.
 * @param actual - The time from Encounter.period.
 * @param calls - The captured calls.
 * @param assignment - Which call to compare with.
 * @returns The adjusted time, or null.
 */
function adjustedTime(
  actual: string | undefined,
  calls: SandataVisit['Calls'],
  assignment: 'Time In' | 'Time Out'
): string | null {
  const adjusted = actual ? toSandataDateTime(actual) : null;
  return adjusted !== calls.find((c) => c.CallAssignment === assignment)?.CallDateTime ? adjusted : null;
}

function findCode(concepts: (CodeableConcept | undefined)[] | undefined, system: string): string | undefined {
  return concepts?.map((c) => c && getCodeBySystem(c, system)).find(Boolean);
}

function requireIdentifier(resource: Resource, system: string): string {
  const value = getIdentifier(resource, system);
  if (!value) {
    throw new Error(`${resource.resourceType}/${resource.id} has no identifier with system ${system}`);
  }
  return value;
}

/**
 * Formats a FHIR instant as Sandata's UTC date-time, YYYY-MM-DDTHH:MM:SSZ, without milliseconds.
 * @param instant - The FHIR dateTime or instant.
 * @returns The Sandata date-time.
 */
function toSandataDateTime(instant: string): string {
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Turns a Medplum id into an ID Sandata accepts: letters and digits only, truncated to the field's maximum length.
 * Medplum ids are UUIDs, which contain dashes and are too long for fields like CallExternalID (16 characters).
 * @param id - The resource id.
 * @param maxLength - The field's maximum length.
 * @returns The ID.
 */
function toSandataId(id: string, maxLength: number): string {
  return id.replace(/[^A-Za-z0-9]/g, '').slice(0, maxLength);
}
