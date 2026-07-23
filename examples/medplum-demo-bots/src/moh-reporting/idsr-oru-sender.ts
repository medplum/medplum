// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { Hl7Context, Hl7Field, Hl7Message, Hl7Segment, createReference, getReferenceString } from '@medplum/core';
import type { Communication, DiagnosticReport, Observation, Patient, Reference, Task } from '@medplum/fhirtypes';
import {
  KENYA_IDSR_IDENTIFIER_SYSTEM,
  KENYA_IDSR_REVIEW_TASK_CODE,
  KENYA_IDSR_TASK_CODE_SYSTEM,
  findReportableCoding,
  getIdsrCommunicationIdentifier,
  getReportableConditionCodings,
} from './kenya-idsr';

export async function handler(medplum: MedplumClient, event: BotEvent<Task>): Promise<Hl7Message | undefined> {
  const task = event.input;
  if (task.resourceType !== 'Task') {
    throw new Error('Unexpected input. Expected Task');
  }

  if (task.status !== 'completed' || !isIdsrReviewTask(task)) {
    return undefined;
  }

  if (!task.focus?.reference?.startsWith('DiagnosticReport/')) {
    throw new Error('IDSR review Task must focus on a DiagnosticReport');
  }

  const communicationIdentifier = getIdsrCommunicationIdentifier(task.id ?? task.focus.reference);
  const existingCommunication = await medplum.searchOne('Communication', {
    identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${communicationIdentifier}`,
  });
  if (existingCommunication) {
    return undefined;
  }

  const report = await medplum.readReference<DiagnosticReport>(task.focus as Reference<DiagnosticReport>);
  const observations = await readReportObservations(medplum, report);
  const patient = report.subject
    ? await medplum.readReference<Patient>(report.subject as Reference<Patient>)
    : undefined;
  if (!patient) {
    throw new Error(`DiagnosticReport ${getReferenceString(report)} must have a Patient subject`);
  }

  const reportableCodings = await getReportableConditionCodings(medplum);
  const matchedObservation = observations.find((observation) => findReportableCoding(observation, reportableCodings));
  if (!matchedObservation) {
    return undefined;
  }

  const message = createKenyaIdsrOruMessage(report, observations, patient, task);
  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    identifier: [{ system: KENYA_IDSR_IDENTIFIER_SYSTEM, value: communicationIdentifier }],
    status: 'completed',
    priority: 'stat',
    subject: createReference(patient),
    basedOn: [createReference(task)],
    partOf: [createReference(report)],
    sent: new Date().toISOString(),
    medium: [{ text: 'HL7v2 ORU^R01 over MLLP' }],
    payload: [
      {
        contentString: message.toString(),
      },
    ],
  });

  return message;
}

export function createKenyaIdsrOruMessage(
  report: DiagnosticReport,
  observations: Observation[],
  patient: Patient,
  task: Task
): Hl7Message {
  const now = new Date();
  const context = new Hl7Context('\n');
  const segments = [
    new Hl7Segment([
      'MSH',
      '^~\\&',
      'MEDPLUM',
      getFacilityCode(task),
      'KHIS',
      'KENYA_MOH',
      formatHl7DateTime(now),
      '',
      'ORU^R01',
      `IDSR${now.getTime()}`,
      'P',
      '2.5.1',
    ]),
    createPidSegment(patient),
    createObrSegment(report),
  ];

  observations.forEach((observation, index) => segments.push(createObxSegment(observation, index + 1)));
  return new Hl7Message(segments, context);
}

function isIdsrReviewTask(task: Task): boolean {
  return !!task.code?.coding?.some((coding) => {
    return coding.system === KENYA_IDSR_TASK_CODE_SYSTEM && coding.code === KENYA_IDSR_REVIEW_TASK_CODE;
  });
}

async function readReportObservations(medplum: MedplumClient, report: DiagnosticReport): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (const observationRef of report.result ?? []) {
    const observation = await medplum.readReference<Observation>(observationRef);
    observations.push(observation);
    for (const memberRef of observation.hasMember ?? []) {
      observations.push(await medplum.readReference<Observation>(memberRef));
    }
  }
  return observations;
}

function createPidSegment(patient: Patient): Hl7Segment {
  return new Hl7Segment([
    'PID',
    '1',
    getPatientIdentifier(patient),
    '',
    '',
    formatName(patient.name?.[0]?.family, patient.name?.[0]?.given?.[0]),
    '',
    patient.birthDate?.replaceAll('-', '') ?? '',
    mapGender(patient.gender),
    '',
    '',
    formatAddress(patient.address?.[0]),
    '',
    patient.telecom?.find((telecom) => telecom.system === 'phone')?.value ?? '',
  ]);
}

function createObrSegment(report: DiagnosticReport): Hl7Segment {
  return new Hl7Segment([
    'OBR',
    '1',
    report.id ?? '',
    '',
    formatCodeableConcept(report.code),
    '',
    '',
    formatHl7DateTime(new Date(report.issued ?? report.meta?.lastUpdated ?? Date.now())),
    '',
    '',
    '',
    '',
    '',
    'Kenya IDSR immediate notification',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    formatHl7DateTime(new Date(report.issued ?? Date.now())),
    '',
    'PH',
    'F',
  ]);
}

function createObxSegment(observation: Observation, setId: number): Hl7Segment {
  return new Hl7Segment([
    'OBX',
    setId.toString(),
    observation.valueCodeableConcept ? 'CE' : 'ST',
    formatCodeableConcept(observation.code),
    '',
    formatObservationValue(observation),
    observation.valueQuantity?.unit ?? '',
    '',
    observation.interpretation?.[0] ? formatCodeableConcept(observation.interpretation[0]) : '',
    '',
    '',
    mapStatus(observation.status),
    '',
    '',
    formatHl7DateTime(new Date(observation.issued ?? Date.now())),
  ]);
}

function formatObservationValue(observation: Observation): string {
  if (observation.valueCodeableConcept) {
    return formatCodeableConcept(observation.valueCodeableConcept);
  }
  if (observation.valueQuantity) {
    return observation.valueQuantity.value?.toString() ?? '';
  }
  if (observation.valueString) {
    return observation.valueString;
  }
  if (observation.valueBoolean !== undefined) {
    return observation.valueBoolean ? 'true' : 'false';
  }
  return '';
}

function formatCodeableConcept(concept: {
  coding?: { system?: string; code?: string; display?: string }[];
  text?: string;
}): string {
  const coding = concept.coding?.[0];
  return new Hl7Field([[coding?.code ?? '', coding?.display ?? concept.text ?? '', coding?.system ?? '']]).toString();
}

function formatName(family = '', given = ''): string {
  return new Hl7Field([[family, given]]).toString();
}

function formatAddress(address: Patient['address'] extends (infer A)[] | undefined ? A : never): string {
  return new Hl7Field([
    [
      address?.line?.[0] ?? '',
      address?.line?.[1] ?? '',
      address?.city ?? '',
      address?.state ?? '',
      address?.postalCode ?? '',
      address?.country ?? 'KEN',
    ],
  ]).toString();
}

function getPatientIdentifier(patient: Patient): string {
  return patient.identifier?.[0]?.value ?? patient.id ?? '';
}

function getFacilityCode(task: Task): string {
  return task.owner?.display ?? 'FACILITY';
}

function formatHl7DateTime(date: Date): string {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
}

function mapGender(gender: Patient['gender']): string {
  switch (gender) {
    case 'male':
      return 'M';
    case 'female':
      return 'F';
    case 'other':
      return 'O';
    default:
      return 'U';
  }
}

function mapStatus(status: Observation['status']): string {
  return status === 'final' ? 'F' : 'P';
}
