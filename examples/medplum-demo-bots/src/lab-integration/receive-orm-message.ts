import {
  BotEvent,
  Hl7Field,
  Hl7Message,
  Hl7Segment,
  MedplumClient,
  createReference,
  getIdentifier,
  parseHl7DateTime,
  setIdentifier,
} from '@medplum/core';
import {
  Annotation,
  CodeableConcept,
  ContactPoint,
  Encounter,
  HumanName,
  Patient,
  Practitioner,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';

export const FACILITY_URL = 'https://lab.acme.org';
export const FACILITY_ORDER_ID = new URL('orderId', FACILITY_URL).toString();
export const FACILITY_PATIENT_ID = new URL('patientId', FACILITY_URL).toString();
export const FACILITY_PRACTITIONER_ID = new URL('patientId', FACILITY_URL).toString();
export const FACILITY_ORDER_CODE_SYSTEM = new URL('orderCode', FACILITY_URL).toString();
export const FACILITY_TIME_ZONE_OFFSET = '-0500';

/**
 * This Bot demonstrates how to send a lab order to an SFTP server in the form of HL7v2 ORM messages
 *
 * See: https://hl7-definition.caristix.com/v2/HL7v2.3/TriggerEvents/ORM_O01
 *
 * @param medplum - The Medplum Client object
 * @param event - The BotEvent object
 * @returns The data returned by the `list` command
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const message = event.input;

  // Create the patient if there is no identifier collision
  // You can substitute this with more complex de-duplication logic
  let patient = parsePatient(message);
  patient = await createWithoutDuplicate(medplum, patient, FACILITY_PATIENT_ID);

  // Create all the referenced Practitioners if there is no identifier collision
  // You can substitute this with more complex de-duplication logic
  let practitioners = parseAllPractitioners(message);
  practitioners = await Promise.all(
    practitioners.map((practitioner) => createWithoutDuplicate(medplum, practitioner, FACILITY_PRACTITIONER_ID))
  );

  // Parse out the PV1 segment related to the encounter
  const encounter = await medplum.createResource(parseEncounter(message, patient, practitioners));

  const serviceRequests = parseServiceRequests(message, patient, practitioners, encounter);
  // Create the ServiceRequest resources
  await Promise.all(
    serviceRequests.map((serviceRequest) => createWithoutDuplicate(medplum, serviceRequest, FACILITY_ORDER_ID))
  );

  return message.buildAck();
}

/**
 * Reference: https://build.fhir.org/ig/HL7/v2-to-fhir/ConceptMap-segment-pid-to-patient.html
 * @param message - HLv2 message
 * @returns a FHIR patient resource
 */
function parsePatient(message: Hl7Message): Patient {
  const pids = message.getAllSegments('PID');
  if (pids.length !== 1) {
    throw new Error(`Got ${pids.length} PID Segments`);
  }

  const pid = pids[0];

  const patient: Patient = {
    resourceType: 'Patient',
    identifier: [],
    name: [parseHl7Name(pid.getField(5))], // PID-5: Patient Name
    birthDate: parseHl7DateTime(pid.getField(7).toString())?.split('T')?.[0], // PID-7: Date of Birth
    gender: parseHl7Gender(pid.getField(8).toString()), // PID-8: Administrative Sex
    telecom: [
      { system: 'phone', use: 'home', value: pid.getComponent(13, 1) } as ContactPoint, // PID-13: Home Phone
      { system: 'phone', use: 'work', value: pid.getComponent(14, 1) } as ContactPoint, // PID-14: Business Phone
    ].filter((telecom) => !!telecom.value?.length),
  };

  const patientId = pid.getField(2); // PID-2: Patient ID
  if (!patientId) {
    console.warn('Missing Patient Id');
  } else {
    setIdentifier(patient, FACILITY_PATIENT_ID, patientId.toString());
  }

  const ssn = pid.getComponent(19, 1); // PID-19: Social Security Number
  if (ssn.length > 0) {
    patient.identifier?.push({
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'SS',
          },
        ],
      },
      system: 'http://hl7.org/fhir/sid/us-ssn',
      value: ssn,
    });
  }

  return patient;
}

/**
 * Parses an HL7v2 PV1 (patient visit) segment into a FHIR `Encounter` resource
 * @param message - HL7v2 message
 * @param patient - The FHIR `Patient` resource, parsed from the PID segment
 * @param practitioners - An array of all `Practitioners` referenced in this message
 * @returns a FHIR `Encounter` resource
 */
function parseEncounter(message: Hl7Message, patient: Patient, practitioners: Practitioner[]): Encounter {
  const segment = message.getSegment('PV1');
  const practitionerId = segment?.getComponent(7, 1);
  const practitioner = practitioners.find(
    (practitioner) => getIdentifier(practitioner, FACILITY_PRACTITIONER_ID) === practitionerId
  );

  return {
    resourceType: 'Encounter',
    status: 'finished',
    class: {
      system: '	http://terminology.hl7.org/ValueSet/v3-ActEncounterCode',
      code: 'AMB',
    },
    subject: createReference(patient),
    participant: practitioner && [{ individual: createReference(practitioner) }],
    period: {
      start: parseHl7DateTime(segment?.getComponent(44, 1), { tzOffset: FACILITY_TIME_ZONE_OFFSET }),
      end: parseHl7DateTime(segment?.getComponent(45, 1), { tzOffset: FACILITY_TIME_ZONE_OFFSET }),
    },
  };
}

/**
 * Extracts all Practitioner references from the PV1, ORC, and OBR segments of the message
 * @param message - HL7v2 message
 * @returns an array Practitioners referenced in the message
 */
function parseAllPractitioners(message: Hl7Message): Practitioner[] {
  const practitioners: Record<string, Practitioner> = {};
  const fields = [
    ...message.getAllSegments('PV1').map((segment) => segment.getField(8)),
    ...message.getAllSegments('ORC').map((segment) => segment.getField(12)),
    ...message.getAllSegments('OBR').map((segment) => segment.getField(16)),
  ];
  for (const field of fields) {
    const practitioner = parsePractitioner(field);
    const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
    if (identifier) {
      practitioners[identifier] = practitioner;
    }
  }

  return Object.values(practitioners);
}

/**
 * Converts an HL7v2 XCN type field to a FHIR `Practitioner` resource
 * @param field - the HL7v2 field
 * @returns a FHIR `Practitioner` resource
 */
function parsePractitioner(field: Hl7Field): Practitioner {
  const identifier = field.getComponent(1);
  const name = parseHl7Name(field, 1);
  return {
    resourceType: 'Practitioner',
    name: [name],
    identifier: [
      {
        system: FACILITY_PRACTITIONER_ID,
        value: identifier,
      },
    ],
  };
}

/**
 * Parse all OBR segments into individual `ServiceRequest` resources
 * @param message - HL7v2 message
 * @param patient - The FHIR `Patient` resource, parsed from from the PID segment
 * @param practitioners - All of the FHIR `Practitioner`resources referenced in this message
 * @param encounter - The FHIR `Patient` resource, parsed from from the PV1 segment
 * @returns an array of FHIR `ServiceRequests` specified in this order
 */
function parseServiceRequests(
  message: Hl7Message,
  patient: Patient,
  practitioners: Practitioner[],
  encounter: Encounter
): ServiceRequest[] {
  // Create a Service Request for each OBR segment
  const requestSegments = collectSegmentGroupsByType(message, 'OBR');
  return requestSegments.map((segment) => parseObrSegment(segment, patient, practitioners, encounter));
}
/**
 * Parse all lines within a specific OBR segment into a FHIR `ServiceRequest` resource, including notes and ordering
 * physician
 * @param segments - The HLv2 segments that are part of this OBR
 * @param patient - The FHIR `Patient` resource, parsed from from the PID segment
 * @param practitioners - All of the FHIR `Practitioner`resources referenced in this message
 * @param encounter - The FHIR `Patient` resource, parsed from from the PV1 segment
 * @returns a FHIR `ServiceRequest` resource related to this order
 */
function parseObrSegment(
  segments: Hl7Segment[],
  patient: Patient,
  practitioners: Practitioner[],
  encounter: Encounter
): ServiceRequest {
  const obr = segments.find((s) => s.getComponent(0, 1) === 'OBR');
  if (!obr) {
    throw new Error('Could not find OBR segment');
  }
  const notes = segments.filter((s) => s.getComponent(0, 1) === 'NTE').map(parseHl7Note);
  const orderingProviderId = obr.getComponent(16, 1);
  const orderingProvider = practitioners.find(
    (practitioner) => getIdentifier(practitioner, FACILITY_PRACTITIONER_ID) === orderingProviderId
  );

  const serviceRequest: ServiceRequest = {
    resourceType: 'ServiceRequest',
    intent: 'order',
    status: 'active',
    subject: createReference(patient),
    encounter: createReference(encounter),
    requisition: { system: FACILITY_ORDER_ID, value: obr.getComponent(2, 1) },
    code: parseHl7CodeableConcept(obr.getField(4)),
    note: notes.length ? notes : undefined,
    requester: orderingProvider && createReference(orderingProvider),
    reasonCode: segments
      .filter((s) => s.getComponent(0, 1) === 'DG1')
      .map((segment) => parseHl7CodeableConcept(segment.getField(3)))
      .filter((e): e is CodeableConcept => !!e),
  };
  return serviceRequest;
}

/**
 * Checks for an existing resource based on identifier. Creates a new resource if there is no existing resource
 * @param medplum - the MedplumClient
 * @param resource - resource to create
 * @param identifierSystem - system string used to identify duplicates
 * @returns new or existing resource
 */
async function createWithoutDuplicate<T extends Resource>(
  medplum: MedplumClient,
  resource: T,
  identifierSystem: string
): Promise<T> {
  return medplum.createResourceIfNoneExist(
    resource,
    `identifier=${identifierSystem}|${getIdentifier(resource, identifierSystem)}`
  );
}

/**
 * Some
 * @param message - HL7v2 Message
 * @param type - The segment group type
 * @returns An array of segment groups, where ech group
 */
function collectSegmentGroupsByType(message: Hl7Message, type: string): Hl7Segment[][] {
  const result: Hl7Segment[][] = [];
  const segments = message.segments;
  let start = undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.getComponent(0, 1) === type) {
      if (start !== undefined) {
        result.push(segments.slice(start, i));
      }
      start = i;
    }
  }
  if (start !== undefined) {
    result.push(segments.slice(start));
  }
  return result;
}

/* HL7v2 Parsing Utilities */
function parseHl7CodeableConcept(field: Hl7Field): CodeableConcept | undefined {
  if (!field.getComponent(1)) {
    return undefined;
  }
  return {
    coding: [
      {
        code: field.getComponent(1),
        display: field.getComponent(2),
        system: translateCodeSystem(field.getComponent(3)),
      },
    ],
  };
}

/**
 * @param noteSegment - an HL7v2 NTE segment
 * @returns a FHIR `Annotation`
 */
function parseHl7Note(noteSegment: Hl7Segment): Annotation {
  return {
    text: noteSegment.getComponent(3, 1),
  };
}

function translateCodeSystem(system: string): string | undefined {
  switch (system.toUpperCase()) {
    case 'I9':
      return 'http://hl7.org/fhir/sid/icd-9-cm';
    case 'L':
      return FACILITY_ORDER_CODE_SYSTEM;
  }
  return undefined;
}

// Reference: https://build.fhir.org/ig/HL7/v2-to-fhir/ConceptMap-datatype-xpn-to-humanname.html
function parseHl7Name(field: Hl7Field, indexOffset = 0): HumanName {
  const name: HumanName = {
    family: field.getComponent(indexOffset + 1),
    given: [field.getComponent(indexOffset + 2)],
  };

  const middleName = field.getComponent(indexOffset + 3);
  if (middleName !== '') {
    name.given?.push(middleName);
  }

  const suffix = field.getComponent(indexOffset + 4);
  if (suffix !== '') {
    name.suffix = [suffix];
  }

  const prefix = field.getComponent(indexOffset + 5);
  if (prefix !== '') {
    name.prefix = [prefix];
  }

  return name;
}

function parseHl7Gender(gender: string): Patient['gender'] {
  switch (gender?.toLowerCase().at(0)) {
    case 'm':
      return 'male';
    case 'f':
      return 'female';
    default:
      return 'unknown';
  }
}
