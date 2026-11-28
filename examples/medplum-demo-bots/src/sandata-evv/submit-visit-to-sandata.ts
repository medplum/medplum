// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Submits finished home care visits to a state's Sandata EVV aggregator.
 *
 * Many U.S. states collect Electronic Visit Verification (EVV) data for Medicaid home care through an
 * aggregator run by Sandata. Agencies that don't use Sandata's own app send their visits through Sandata's
 * "alternate EVV" REST interface. This Bot maps a visit recorded with the Medplum home care visit model
 * (https://www.medplum.com/docs/scheduling/home-care-visits) to that interface.
 *
 * TRIGGER
 *   A Subscription on `Encounter?class=HH&status=finished,cancelled,entered-in-error`. Each finished visit is
 *   sent once; an Encounter that is corrected or voided afterwards is sent again as an update.
 *
 * WHAT IT SENDS
 *   Sandata rejects a visit whose client (patient) or employee (caregiver) it doesn't have yet, so the Bot sends
 *   three records in order, waiting for Sandata to finish processing each:
 *     1. The employee, from the caregiver's Practitioner.
 *     2. The client, from the Patient.
 *     3. The visit, from the Encounter: one "Time In" and one "Time Out" call from the clock-in and clock-out
 *        Locations in Encounter.location, plus completed Tasks.
 *   The outcome is kept on a Task (code sandata-evv-submission) that points at the Encounter, so staff can see
 *   rejected visits and the transaction UUIDs Sandata support asks for.
 *
 * SEQUENCEID
 *   Every client, employee, and visit record carries a SequenceID. It is a version number for that record, chosen
 *   by the sender: Sandata keeps the record with the highest SequenceID as current, files a lower one as history,
 *   and rejects an equal one as a duplicate (error -709). A record that was rejected must be resent with a higher
 *   SequenceID. This Bot uses the transmission time as YYYYMMDDHHMMSS (the format Sandata recommends), and for
 *   visits also makes sure it is higher than the last one sent, which it keeps on the tracking Task.
 *
 * VISITCHANGES
 *   EVV rules require an audit trail for any visit that wasn't captured entirely by a device. The VisitChanges
 *   segment says who changed the visit (ChangeMadeBy), when (ChangeDateTime), and why (a state-defined ReasonCode,
 *   with ChangeReasonMemo when the code needs an explanation). Sandata requires it when:
 *     - a call is "Manual" (no GPS reading, for example because location services were unavailable),
 *     - the visit has adjusted times (a supervisor corrected the clock-in or clock-out time), or
 *     - the visit is an update to one Sandata already accepted.
 *   In Medplum, a correction is a Provenance that targets the Encounter, with the supervisor as the agent and the
 *   state's reason code in Provenance.reason. The Bot refuses to send a visit that needs VisitChanges but has no
 *   such Provenance, rather than let Sandata reject it.
 *
 * ADJUSTED TIMES
 *   The calls always carry the originally captured times, from Encounter.location[].period. If Encounter.period
 *   differs (because it was corrected), the corrected times go in AdjInDateTime and AdjOutDateTime, which
 *   supersede the calls.
 *
 * ASSUMPTIONS
 *   - The spec is an amalgamation of Sandata's published Indiana, Connecticut, and Rhode Island specifications.
 *     Only fields that appear in all of them are sent, because Sandata rejects transmissions containing a field
 *     name it doesn't recognize. Your state's specification may require more (Missouri requires ClientBirthDate,
 *     for example) or fewer fields. Check it before going live, and test in Sandata's UAT environment.
 *   - State-specific values are in EXAMPLE_CONFIG below: identifier qualifiers, which FHIR identifier holds each
 *     ID, timezone, payer and program codes, procedure codes, task IDs, and reason codes.
 *   - Encounter.serviceProvider is the agency, with its state provider ID in Organization.identifier.
 *   - The first Encounter.participant is the caregiver, with the state's employee ID in Practitioner.identifier.
 *     Where the state uses SSNs (Rhode Island, Connecticut), only the last 5 digits are sent, masked as 0000#####.
 *   - The patient's state client ID is in Patient.identifier and is also used as ClientOtherID, the
 *     vendor's own key, because Medplum's UUIDs are longer than the 24 characters Sandata allows.
 *   - One payer per visit type: the Encounter.type code chooses the payer, program, and procedure code. If your
 *     patients have different payers for the same service, look the payer up from their Coverage instead.
 *   - Completed Tasks become Tasks entries. Planned tasks that weren't performed are left out; Sandata's
 *     TaskRefused flag means the patient refused, which the visit model doesn't record.
 *   - The employee and client are sent with every visit. Sandata recommends sending only changed records, which
 *     needs a record of what was last sent for each; if two visits for the same person are sent within the same
 *     second, the second copy is rejected as a duplicate, which this Bot ignores.
 *   - Sandata usually finishes processing within seconds. If it hasn't after a few status checks, the Task is
 *     left in-progress with the transaction UUID. Re-run the Bot (or check the status from a cron Bot) to finish.
 *
 * SECRETS
 *   SANDATA_BASE_URL   For example https://uat-api.sandata.com/interfaces/intake
 *   SANDATA_USERNAME   API credentials for the agency's Sandata account
 *   SANDATA_PASSWORD
 *   SANDATA_ACCOUNT    The agency's Sandata account number
 */

import { createReference, getReferenceString } from '@medplum/core';
import type { BotEvent, MedplumClient, WithId } from '@medplum/core';
import type { Encounter, Patient, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { sendRecords } from './sandata-api';
import type { SandataCredentials } from './sandata-api';
import { buildRecords, toSequenceId } from './sandata-evv';
import type { SandataConfig, SandataRecords, VisitContext } from './sandata-evv';

/** Example configuration. Replace these values with the ones from your state's specification. */
export const EXAMPLE_CONFIG: SandataConfig = {
  provider: { qualifier: 'MedicaidID', identifierSystem: 'https://example.com/fhir/state-medicaid-provider-id' },
  client: {
    qualifier: 'ClientMedicaidID',
    visitQualifier: 'ClientMedicaidID',
    identifierSystem: 'https://example.com/fhir/state-medicaid-id',
  },
  employee: { qualifier: 'EmployeeSSN', identifierSystem: 'http://hl7.org/fhir/sid/us-ssn', maskSsn: true },
  timeZone: 'US/Eastern',
  serviceCodeSystem: 'https://example.com/fhir/CodeSystem/home-care-services',
  services: {
    'personal-care': { payerId: 'STATE_MEDICAID', payerProgram: 'PCS', procedureCode: 'T1019' },
    homemaker: { payerId: 'STATE_MEDICAID', payerProgram: 'PCS', procedureCode: 'S5130' },
  },
  taskCodeSystem: 'https://example.com/fhir/CodeSystem/home-care-tasks',
  // Placeholder IDs: each state publishes its own task list
  taskIds: {
    bathing: '100',
    'dressing-grooming': '101',
    'meal-preparation': '102',
    laundry: '103',
  },
  reasonCodeSystem: 'https://example.com/fhir/CodeSystem/evv-reason-codes',
  visitEventSystem: 'https://example.com/fhir/CodeSystem/visit-verification-event',
};

const SUBMISSION_IDENTIFIER_SYSTEM = 'https://example.com/fhir/sandata-visit-submission';
const SUBMISSION_TASK_CODE = {
  system: 'https://example.com/fhir/CodeSystem/integration-task',
  code: 'sandata-evv-submission',
  display: 'Sandata EVV submission',
};
/** Sandata's error code for a record whose SequenceID it already has. */
const DUPLICATE_SEQUENCE_ERROR = '-709:';
const STATUS_CHECKS = 5;

/**
 * Submits a finished visit to Sandata.
 * @param medplum - The Medplum client.
 * @param event - The Bot event. The input is the Encounter.
 * @param config - The Sandata configuration for your state.
 * @returns The Task that tracks the submission, or undefined if the Encounter isn't ready to submit.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Encounter>,
  config: SandataConfig = EXAMPLE_CONFIG
): Promise<WithId<Task> | undefined> {
  const encounter = event.input as WithId<Encounter>;
  if (!['finished', 'cancelled', 'entered-in-error'].includes(encounter.status)) {
    return undefined;
  }

  const existing = await medplum.searchOne('Task', {
    identifier: `${SUBMISSION_IDENTIFIER_SYSTEM}|${getReferenceString(encounter)}`,
  });
  // Don't resend a version of the Encounter that was already sent (for example, if the Bot runs twice)
  if (existing && getOutput(existing, 'encounter-version') === encounter.meta?.versionId) {
    return existing;
  }

  const credentials = getCredentials(event.secrets);
  const delayMs = Number(event.secrets['SANDATA_POLL_DELAY_MS']?.valueString ?? 2000);
  const now = new Date();
  const outputs: Record<string, string> = {
    'encounter-version': encounter.meta?.versionId ?? '',
    'visit-sequence-id': String(toSequenceId(now, Number(getOutput(existing, 'visit-sequence-id')) || undefined)),
    accepted: getOutput(existing, 'accepted') ?? 'false',
  };

  // Creates or updates the Task that tracks this Encounter's submission
  const save = (status: Task['status'], businessStatus: string, errors: string[] = []): Promise<WithId<Task>> => {
    const task: Task = {
      ...existing,
      resourceType: 'Task',
      identifier: [{ system: SUBMISSION_IDENTIFIER_SYSTEM, value: getReferenceString(encounter) }],
      status,
      intent: 'order',
      code: { coding: [SUBMISSION_TASK_CODE], text: SUBMISSION_TASK_CODE.display },
      focus: createReference(encounter),
      for: encounter.subject,
      businessStatus: { text: businessStatus },
      statusReason: errors.length > 0 ? { text: errors.join('\n') } : undefined,
      lastModified: new Date().toISOString(),
      output: Object.entries(outputs).map(([name, value]) => ({ type: { text: name }, valueString: value })),
    };
    return existing ? medplum.updateResource({ ...task, id: existing.id }) : medplum.createResource(task);
  };

  let records: SandataRecords;
  try {
    records = buildRecords(config, await loadVisit(medplum, encounter), {
      sequenceId: toSequenceId(now),
      visitSequenceId: Number(outputs['visit-sequence-id']),
      isUpdate: outputs.accepted === 'true',
    });
  } catch (err) {
    // Missing identifiers, unmapped codes, or an unexplained correction: fix the data, then update the Encounter.
    // Clearing encounter-version lets the same version be sent once the data is fixed.
    outputs['encounter-version'] = '';
    return save('failed', 'invalid', [(err as Error).message]);
  }

  for (const type of ['employees', 'clients', 'visits'] as const) {
    const result = await sendRecords(credentials, type, [records[type]], STATUS_CHECKS, delayMs);
    outputs[`${type}-transaction-uuid`] = result.uuid;
    if (!result.complete) {
      return save('in-progress', `awaiting-${type}-status`);
    }
    // An employee or client that another visit already sent in the same second is a harmless duplicate
    const errors = result.errors.filter((e) => type === 'visits' || !e.startsWith(DUPLICATE_SEQUENCE_ERROR));
    if (errors.length > 0) {
      return save('failed', `${type}-rejected`, errors);
    }
  }

  outputs.accepted = 'true';
  return save('completed', 'accepted');
}

function getCredentials(secrets: BotEvent['secrets']): SandataCredentials {
  const read = (name: string): string => {
    const value = secrets[name]?.valueString;
    if (!value) {
      throw new Error(`Missing Bot secret ${name}`);
    }
    return value;
  };
  return {
    baseUrl: read('SANDATA_BASE_URL').replace(/\/$/, ''),
    username: read('SANDATA_USERNAME'),
    password: read('SANDATA_PASSWORD'),
    account: read('SANDATA_ACCOUNT'),
  };
}

/**
 * Loads everything about a visit that the Sandata records are built from.
 * @param medplum - The Medplum client.
 * @param encounter - The Encounter.
 * @returns The visit context.
 */
async function loadVisit(medplum: MedplumClient, encounter: WithId<Encounter>): Promise<VisitContext> {
  const caregiverRef = encounter.participant?.[0]?.individual;
  if (!encounter.serviceProvider || !caregiverRef?.reference?.startsWith('Practitioner/')) {
    throw new Error(`Encounter/${encounter.id} needs a serviceProvider (the agency) and a caregiver participant`);
  }
  const [agency, patient, caregiver, tasks, corrections, locations] = await Promise.all([
    medplum.readReference(encounter.serviceProvider),
    medplum.readReference(encounter.subject as Reference<Patient>),
    medplum.readReference(caregiverRef as Reference<Practitioner>),
    medplum.searchResources('Task', { encounter: getReferenceString(encounter) }),
    medplum.searchResources('Provenance', { target: getReferenceString(encounter), _sort: 'recorded' }),
    Promise.all((encounter.location ?? []).map((l) => medplum.readReference(l.location))),
  ]);
  return { encounter, agency, patient, caregiver, locations, tasks, corrections };
}

function getOutput(task: Task | undefined, name: string): string | undefined {
  return task?.output?.find((o) => o.type.text === name)?.valueString;
}
