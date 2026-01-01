// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  getIdentifier,
  getReferenceString,
  parseHl7DateTime,
  setIdentifier,
} from '@medplum/core';
import type { BotEvent, Hl7Field, Hl7Message, MedplumClient } from '@medplum/core';
import type {
  Annotation,
  ClinicalImpression,
  Encounter,
  HumanName,
  Location,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';

const FACILITY_PATIENT_ID = 'https://example.org/facility/patient-id';
const FACILITY_PRACTITIONER_ID = 'https://example.org/facility/practitioner-id';
const FACILITY_LOCATION_ID = 'https://example.org/facility/location-id';
const FACILITY_TIMEZONE_OFFSET = '-05:00';

/**
 * This Bot parses HL7v2 ORU and ADT messages from the request and creates FHIR resources for charting encounters and notes
 * as described in https://www.medplum.com/docs/charting#capturing-notes
 *
 * ## Supported HL7 Message Types
 *
 * ### ORU^R01 (Observation Result - Unsolicited)
 * Observation Result messages contain lab results, clinical observations, and notes from diagnostic procedures.
 * - **Segments parsed**: MSH, PID, PV1, ORC, OBR, OBX, NTE
 * - **FHIR Resources created**:
 *   - `Patient` - From PID segment (patient demographics)
 *   - `Practitioner` - From PV1-7/8 (attending/referring doctor), ORC-12, OBR-16 (ordering provider)
 *   - `Location` - From PV1-3 (patient location)
 *   - `Encounter` - From PV1 segment (patient visit). Links to existing ADT encounter via visit number (PV1-19) or time-window matching (±24 hours)
 *   - `ClinicalImpression` - From NTE segments and OBX segments with TX/FT value types (clinical notes)
 *
 * ### ADT^A01 (Admit/Visit Notification)
 * Patient admission or visit start notification.
 * - **Segments parsed**: MSH, PID, PV1, ORC
 * - **FHIR Resources created**:
 *   - `Patient` - From PID segment (patient demographics)
 *   - `Practitioner` - From PV1-7/8 (attending/referring doctor), ORC-12
 *   - `Location` - From PV1-3 (patient location)
 *   - `Encounter` - New encounter with status "in-progress" and visit number identifier from PV1-19
 *
 * ### ADT^A08 (Update Patient Information)
 * Patient demographic or visit information update.
 * - **Segments parsed**: MSH, PID, PV1, ORC
 * - **FHIR Resources created/updated**:
 *   - `Patient` - From PID segment (updated if exists, created if new)
 *   - `Practitioner` - From PV1-7/8, ORC-12
 *   - `Location` - From PV1-3
 *   - `Encounter` - Updates existing encounter by visit number (PV1-19). Does not create new encounters (assumes ADT A01 has already created the encounter)
 *
 * ### ADT^A03 (Discharge/End Visit)
 * Patient discharge or visit end notification.
 * - **Segments parsed**: MSH, PID, PV1, ORC
 * - **FHIR Resources created/updated**:
 *   - `Patient` - From PID segment
 *   - `Practitioner` - From PV1-7/8, ORC-12
 *   - `Location` - From PV1-3
 *   - `Encounter` - Updates existing encounter status to "finished" and sets end date from PV1-45
 *
 * ## Key Features
 * - **Case-insensitive duplicate detection**: Practitioners and locations are matched case-insensitively to prevent duplicates
 * - **Encounter linking**: ORU messages automatically link to existing ADT encounters using a two-tier approach:
 *   - **Primary**: Visit number matching (PV1-19) when available
 *   - **Fallback**: Time-window matching (±24 hours around encounter date) to handle:
 *     - Systems that don't populate visit numbers (common in real-world datasets)
 *     - Messages arriving out of chronological order (ORU may arrive before/after ADT)
 *     - Backdated or delayed message processing
 * - **Clinical notes extraction**: Collects notes from NTE segments and OBX segments with text value types
 *
 * ## References
 * - ORU Message Structure: https://v2plus.hl7.org/2021Jan/message-structure/ORU_R01.html
 * - ADT Message Structure: https://v2plus.hl7.org/2021Jan/message-structure/ADT_A01.html
 * - Charting Documentation: https://www.medplum.com/docs/charting#capturing-notes
 *
 * @param medplum - The Medplum client
 * @param event - The Bot event containing the HL7v2 message
 * @returns The Bot result
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const message = event.input;

  // Log the original HL7 message
  console.log('Original HL7 message:', message.toString().replaceAll('\r', '\n'));

  // Get message type
  const messageType = message.header.getComponent(9, 1);
  const messageSubtype = message.header.getComponent(9, 2);

  try {
    // Handle ORU messages (lab results with notes)
    if (messageType === 'ORU') {
      // Parse patient
      const patient = await findOrCreatePatient(medplum, message);

      // Parse and create practitioners (with case-insensitive matching)
      const practitioners = await findOrCreatePractitioners(medplum, message);

      // Parse and create locations (with case-insensitive matching)
      const locations = await findOrCreateLocations(medplum, message);

      // Parse and create encounter
      const encounter = await findOrCreateEncounter(medplum, message, patient, practitioners, locations);

      // Parse and create clinical impression (notes)
      await createClinicalImpression(medplum, message, patient, encounter);
      // Return ACK with success code (AA = Application Accept)
      return message.buildAck({ ackCode: 'AA' });
    }

    // Handle ADT messages (admit, discharge, transfer)
    if (messageType === 'ADT') {
      // Supported ADT event types: A01 (admit), A08 (update), A03 (discharge)
      if (messageSubtype !== 'A01' && messageSubtype !== 'A08' && messageSubtype !== 'A03') {
        console.log(`ADT message subtype ${messageSubtype} not supported, skipping`);
        // Return ACK with success code even for unsupported subtypes (they're just skipped)
        return message.buildAck({ ackCode: 'AA' });
      }

      // Parse patient
      const patient = await findOrCreatePatient(medplum, message);

      // Parse and create practitioners (with case-insensitive matching)
      const practitioners = await findOrCreatePractitioners(medplum, message);

      // Parse and create locations (with case-insensitive matching)
      const locations = await findOrCreateLocations(medplum, message);

      // Parse and create/update encounter based on ADT event type
      await processAdtEncounter(medplum, message, patient, practitioners, locations, messageSubtype);
      // Return ACK with success code (AA = Application Accept)
      return message.buildAck({ ackCode: 'AA' });
    }

    // Unsupported message type - return ACK with error code (AE = Application Error)
    return message.buildAck({ ackCode: 'AE' });
  } catch (error) {
    // If processing fails, return ACK with error code (AE = Application Error)
    console.error('Error processing HL7 message:', error);
    return message.buildAck({ ackCode: 'AE' });
  }
}

/**
 * Finds or creates a Patient resource from the PID segment
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @returns The Patient resource
 */
async function findOrCreatePatient(medplum: MedplumClient, message: Hl7Message): Promise<Patient> {
  const pidSegment = message.getSegment('PID');
  if (!pidSegment) {
    throw new Error('Missing PID segment');
  }

  // Try PID-2 (External Patient ID) first, then fall back to PID-3 (Patient Identifier List)
  // Note: PID-3 is the standard HL7v2 field, but many systems populate PID-2
  const patientId = pidSegment.getField(2)?.toString() || pidSegment.getComponent(3, 1);
  if (!patientId) {
    throw new Error('Missing patient ID in PID segment (checked PID-2 and PID-3)');
  }

  // Try to find existing patient by identifier
  const existingPatient = await medplum.searchOne('Patient', {
    identifier: `${FACILITY_PATIENT_ID}|${patientId}`,
  });

  if (existingPatient) {
    return existingPatient;
  }

  // Create new patient
  const patient: Patient = {
    resourceType: 'Patient',
    identifier: [],
    name: [parseHl7Name(pidSegment.getField(5))],
    birthDate: parseHl7DateTime(pidSegment.getField(7)?.toString())?.split('T')?.[0],
    // Gender from PID-8, mapped to FHIR Administrative Gender value set:
    // See: https://hl7.org/fhir/ValueSet/administrative-gender
    gender: parseHl7Gender(pidSegment.getField(8)?.toString()),
  };

  setIdentifier(patient, FACILITY_PATIENT_ID, patientId);

  return medplum.createResource(patient);
}

/**
 * Finds or creates Practitioner resources from the message (case-insensitive matching)
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @returns Array of Practitioner resources
 */
async function findOrCreatePractitioners(medplum: MedplumClient, message: Hl7Message): Promise<Practitioner[]> {
  const practitioners: Record<string, Practitioner> = {};

  // Extract practitioners from PV1, ORC, and OBR segments
  const pv1Segment = message.getSegment('PV1');
  if (pv1Segment) {
    // PV1-7: Attending Doctor
    const attendingDoctorField = pv1Segment.getField(7);
    if (attendingDoctorField) {
      const practitioner = parsePractitioner(attendingDoctorField);
      const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
      if (identifier) {
        practitioners[identifier.toLowerCase()] = practitioner;
      }
    }
    // PV1-8: Referring Doctor
    const referringDoctorField = pv1Segment.getField(8);
    if (referringDoctorField) {
      const practitioner = parsePractitioner(referringDoctorField);
      const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
      if (identifier) {
        practitioners[identifier.toLowerCase()] = practitioner;
      }
    }
  }

  // Extract from ORC segments
  const orcSegments = message.getAllSegments('ORC');
  for (const orc of orcSegments) {
    const practitionerField = orc.getField(12);
    if (practitionerField) {
      const practitioner = parsePractitioner(practitionerField);
      const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
      if (identifier) {
        practitioners[identifier.toLowerCase()] = practitioner;
      }
    }
  }

  // Extract from OBR segments
  const obrSegments = message.getAllSegments('OBR');
  for (const obr of obrSegments) {
    const practitionerField = obr.getField(16);
    if (practitionerField) {
      const practitioner = parsePractitioner(practitionerField);
      const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
      if (identifier) {
        practitioners[identifier.toLowerCase()] = practitioner;
      }
    }
  }

  // Find or create each practitioner (case-insensitive matching)
  const result: Practitioner[] = [];
  const processedIdentifiers = new Set<string>();

  for (const practitioner of Object.values(practitioners)) {
    const identifier = getIdentifier(practitioner, FACILITY_PRACTITIONER_ID);
    if (!identifier) {
      continue;
    }

    const identifierLower = identifier.toLowerCase();
    if (processedIdentifiers.has(identifierLower)) {
      continue; // Already processed this practitioner
    }
    processedIdentifiers.add(identifierLower);

    // Search for existing practitioner by identifier
    const existingPractitioner = await medplum.searchOne('Practitioner', {
      identifier: `${FACILITY_PRACTITIONER_ID}|${identifier}`,
    });

    if (existingPractitioner) {
      result.push(existingPractitioner);
      continue;
    }

    // Create new practitioner if not found
    const created = await medplum.createResource(practitioner);
    result.push(created);
  }

  return result;
}

/**
 * Finds or creates Location resources from the message (case-insensitive matching)
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @returns Array of Location resources
 */
async function findOrCreateLocations(medplum: MedplumClient, message: Hl7Message): Promise<Location[]> {
  const locations: Record<string, Location> = {};

  // Extract locations from PV1 segment
  // Note: Location is in PV1-2 (non-standard) instead of PV1-3
  const pv1Segment = message.getSegment('PV1');
  if (pv1Segment) {
    const locationName = pv1Segment.getComponent(2, 1);
    if (locationName) {
      const location: Location = {
        resourceType: 'Location',
        name: locationName,
        identifier: [
          {
            system: FACILITY_LOCATION_ID,
            value: locationName,
          },
        ],
      };
      locations[locationName.toLowerCase()] = location;
    }
  }

  // Find or create each location (case-insensitive matching)
  const result: Location[] = [];
  const processedNames = new Set<string>();

  for (const location of Object.values(locations)) {
    const locationName = location.name;
    if (!locationName) {
      continue;
    }

    const nameLower = locationName.toLowerCase();
    if (processedNames.has(nameLower)) {
      continue; // Already processed this location
    }
    processedNames.add(nameLower);

    // Search for existing location by name
    const existingLocations = await medplum.searchResources('Location', {
      name: locationName,
    });

    // Check if any match has the same name (case-insensitive)
    let found = false;
    for (const existing of existingLocations) {
      if (existing.name?.toLowerCase() === nameLower) {
        result.push(existing);
        found = true;
        break;
      }
    }

    // If not found, create new location
    if (!found) {
      const created = await medplum.createResource(location);
      result.push(created);
    }
  }

  return result;
}

/**
 * Finds or creates an Encounter resource from the message
 * For ORU messages, tries to find an existing encounter (from ADT) before creating a new one
 *
 * **Encounter Linking Strategy:**
 * This function uses a two-tier approach to link ORU messages to existing ADT encounters:
 *
 * 1. **Visit Number Matching (Primary)**: If PV1-19 (visit number) is populated, searches for
 *    an existing encounter with matching visit number identifier. This is the most reliable method
 *    but is often not available in real-world datasets (visit numbers may be missing).
 *
 * 2. **Time-Window Matching (Fallback)**: If no visit number is available, searches for encounters
 *    within a 24-hour window (±24 hours) around the encounter start date. This handles:
 *    - Messages arriving out of chronological order (ADT may arrive after ORU, or vice versa)
 *    - Systems that don't populate visit numbers
 *    - Backdated or delayed message processing
 *
 * **Why Time-Window Matching is Critical:**
 * - Many HL7 implementations don't populate PV1-19 (visit number), making it unavailable for linking
 * - Messages can arrive out of order (ORU may arrive before ADT, or ADT updates may arrive after ORU)
 * - The 24-hour window provides a reasonable tolerance for message timing variations while avoiding
 *   false matches across different encounters
 *
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @param patient - The Patient resource
 * @param practitioners - Array of Practitioner resources
 * @param locations - Array of Location resources
 * @returns The Encounter resource
 */
async function findOrCreateEncounter(
  medplum: MedplumClient,
  message: Hl7Message,
  patient: Patient,
  practitioners: Practitioner[],
  locations: Location[]
): Promise<Encounter> {
  const pv1Segment = message.getSegment('PV1');
  if (!pv1Segment) {
    throw new Error('Missing PV1 segment');
  }

  // Extract visit number from PV1-19 (if present)
  // Note: In many real-world datasets, visit numbers are not populated (0% in typical datasets)
  const visitNumber = pv1Segment.getComponent(19, 1);

  // Try to find existing encounter by visit number first (most reliable if available)
  if (visitNumber) {
    const existingEncounter = await medplum.searchOne('Encounter', {
      identifier: `https://example.org/facility/visit-id|${visitNumber}`,
      subject: getReferenceString(patient),
    });

    if (existingEncounter) {
      return existingEncounter;
    }
  }

  // Extract encounter dates from PV1-44 (admit date) and PV1-45 (discharge date)
  // Default to current time if admit date is not provided (enables time-window matching for messages without dates)
  const parsedStartDate = parseHl7DateTime(pv1Segment.getComponent(44, 1), { tzOffset: FACILITY_TIMEZONE_OFFSET });
  const startDate = parsedStartDate || new Date().toISOString();
  const endDate = parseHl7DateTime(pv1Segment.getComponent(45, 1), { tzOffset: FACILITY_TIMEZONE_OFFSET });

  // ORU Time-Window Matching: If no visit number, search for encounters within ±24 hours
  // This links ORU messages to existing ADT encounters when visit numbers are not available
  // Handles out-of-order message arrival and systems without visit numbers
  if (!visitNumber && startDate) {
    // Create a 48-hour window (±24 hours around the encounter start date)
    const searchStart = new Date(startDate);
    searchStart.setHours(searchStart.getHours() - 24);
    const searchEnd = new Date(startDate);
    searchEnd.setHours(searchEnd.getHours() + 24);

    // Search for existing encounters for this patient within the time window
    // Results are sorted by date (newest first) and limited to 1 to get the most recent match
    const existingEncounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patient),
      date: `ge${searchStart.toISOString()}`,
      _sort: '-date',
      _count: '1',
    });

    // Filter to only include encounters within the window (MockClient may not support date range arrays)
    const matchingEncounters = existingEncounters.filter((enc) => {
      const encDate = enc.period?.start ? new Date(enc.period.start) : null;
      return encDate && encDate <= searchEnd;
    });

    if (matchingEncounters.length > 0) {
      return matchingEncounters[0];
    }
  }

  // Extract practitioner from PV1-7 (Attending Doctor)
  const practitionerId = pv1Segment.getComponent(7, 1);
  // Try to match PV1-7 practitioner first, otherwise fall back to first available practitioner
  // (ORC/OBR practitioners may be the only source for ordering provider in ORU messages)
  let practitioner = practitionerId
    ? practitioners.find(
        (p) => getIdentifier(p, FACILITY_PRACTITIONER_ID)?.toLowerCase() === practitionerId.toLowerCase()
      )
    : undefined;

  // Fall back to first practitioner if PV1-7 is empty but we have practitioners from ORC/OBR
  if (!practitioner && practitioners.length > 0) {
    practitioner = practitioners[0];
  }

  // Extract location from PV1-2 (non-standard: location is in field 2 instead of field 3)
  const locationName = pv1Segment.getComponent(2, 1);
  // Only match if locationName is provided - avoid matching undefined to undefined
  const location = locationName
    ? locations.find((l) => l.name?.toLowerCase() === locationName.toLowerCase())
    : undefined;

  // Use default encounter class since PV1-2 contains location in this dataset
  // Maps to FHIR Encounter.class using the Encounter Class value set:
  // See: https://terminology.hl7.org/5.1.0/ValueSet-encounter-class.html
  // Code system: http://terminology.hl7.org/CodeSystem/v3-ActCode
  const encounterClass = 'AMB';

  // Create new encounter if none found
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: encounterClass,
      display: getEncounterClassDisplay(encounterClass),
    },
    subject: createReference(patient),
    participant: practitioner
      ? [
          {
            individual: createReference(practitioner),
          },
        ]
      : undefined,
    location: location
      ? [
          {
            location: createReference(location),
          },
        ]
      : undefined,
    period: {
      start: startDate,
      end: endDate || startDate,
    },
  };

  // Add visit number identifier if present
  if (visitNumber) {
    encounter.identifier = [
      {
        system: 'https://example.org/facility/visit-id',
        value: visitNumber,
      },
    ];
  }

  return medplum.createResource(encounter);
}

/**
 * Processes ADT encounter messages (A01, A08, A03)
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @param patient - The Patient resource
 * @param practitioners - Array of Practitioner resources
 * @param locations - Array of Location resources
 * @param eventType - ADT event type (A01, A08, A03)
 */
async function processAdtEncounter(
  medplum: MedplumClient,
  message: Hl7Message,
  patient: Patient,
  practitioners: Practitioner[],
  locations: Location[],
  eventType: string
): Promise<void> {
  const pv1Segment = message.getSegment('PV1');
  if (!pv1Segment) {
    console.log('ADT message missing PV1 segment, skipping encounter processing');
    return;
  }

  // Extract encounter identifier from PV1-19 (visit number)
  const visitNumber = pv1Segment.getComponent(19, 1);

  // Extract encounter dates
  // For A08 updates, keep parsed values (may be undefined) to preserve existing encounter dates
  // For A01/A03, default to current time if not provided
  const parsedStartDate = parseHl7DateTime(pv1Segment.getComponent(44, 1), { tzOffset: FACILITY_TIMEZONE_OFFSET });
  const parsedEndDate = parseHl7DateTime(pv1Segment.getComponent(45, 1), { tzOffset: FACILITY_TIMEZONE_OFFSET });
  const defaultTime = new Date().toISOString();
  const startDate = eventType === 'A08' ? parsedStartDate : (parsedStartDate || defaultTime);
  const endDate = eventType === 'A08' ? parsedEndDate : (parsedEndDate || defaultTime);

  // Try to find existing encounter by visit number first (most reliable if available)
  let existingEncounter: Encounter | undefined;
  if (visitNumber) {
    existingEncounter = await medplum.searchOne('Encounter', {
      identifier: `https://example.org/facility/visit-id|${visitNumber}`,
      subject: getReferenceString(patient),
    });
  }

  // ADT A08/A03 Time-Window Matching: If no visit number, search for encounters within ±24 hours
  // This links ADT update/discharge messages to existing encounters when visit numbers are not available
  // Handles out-of-order message arrival and systems without visit numbers
  if (!existingEncounter && !visitNumber && (eventType === 'A08' || eventType === 'A03')) {
    const searchDate = parsedStartDate || parsedEndDate || defaultTime;
    const searchStart = new Date(searchDate);
    searchStart.setHours(searchStart.getHours() - 24);
    const searchEnd = new Date(searchDate);
    searchEnd.setHours(searchEnd.getHours() + 24);

    const existingEncounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patient),
      date: `ge${searchStart.toISOString()}`,
      _sort: '-date',
      _count: '1',
    });

    // Filter to only include encounters within the window
    const matchingEncounters = existingEncounters.filter((enc) => {
      const encDate = enc.period?.start ? new Date(enc.period.start) : null;
      return encDate && encDate <= searchEnd;
    });

    if (matchingEncounters.length > 0) {
      existingEncounter = matchingEncounters[0];
    }
  }

  // Extract practitioner from PV1
  const practitionerId = pv1Segment.getComponent(7, 1);
  // Only match if practitionerId is provided - avoid matching undefined to undefined
  const practitioner = practitionerId
    ? practitioners.find(
        (p) => getIdentifier(p, FACILITY_PRACTITIONER_ID)?.toLowerCase() === practitionerId.toLowerCase()
      )
    : undefined;

  // Extract location from PV1-2 (non-standard: location is in field 2 instead of field 3)
  const locationName = pv1Segment.getComponent(2, 1);
  // Only match if locationName is provided - avoid matching undefined to undefined
  const location = locationName
    ? locations.find((l) => l.name?.toLowerCase() === locationName.toLowerCase())
    : undefined;

  // Use default encounter class since PV1-2 contains location in this dataset
  // Maps to FHIR Encounter.class using the Encounter Class value set:
  // See: https://terminology.hl7.org/5.1.0/ValueSet-encounter-class.html
  // Code system: http://terminology.hl7.org/CodeSystem/v3-ActCode
  const encounterClass = 'AMB';

  // Process based on event type
  if (eventType === 'A01') {
    // Admit/visit notification - create new encounter (or update if duplicate)
    // Check for existing encounter to prevent duplicates from reprocessed messages
    if (existingEncounter) {
      console.log('ADT A01: Encounter already exists for visit number, updating instead of creating duplicate');
      existingEncounter.status = 'in-progress';
      existingEncounter.participant = practitioner
        ? [
            {
              individual: createReference(practitioner),
            },
          ]
        : existingEncounter.participant;
      existingEncounter.location = location
        ? [
            {
              location: createReference(location),
            },
          ]
        : existingEncounter.location;
      if (startDate) {
        existingEncounter.period = {
          start: startDate,
          end: endDate || existingEncounter.period?.end || startDate,
        };
      }
      await medplum.updateResource(existingEncounter);
      return;
    }

    const encounter: Encounter = {
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: encounterClass,
        display: getEncounterClassDisplay(encounterClass),
      },
      subject: createReference(patient),
      participant: practitioner
        ? [
            {
              individual: createReference(practitioner),
            },
          ]
        : undefined,
      location: location
        ? [
            {
              location: createReference(location),
            },
          ]
        : undefined,
      period: {
        start: startDate,
        end: endDate || startDate,
      },
    };

    if (visitNumber) {
      encounter.identifier = [
        {
          system: 'https://example.org/facility/visit-id',
          value: visitNumber,
        },
      ];
    }

    await medplum.createResource(encounter);
  } else if (eventType === 'A08') {
    // Update patient information - only update existing encounter, do not create new one
    // ADT A08 assumes an ADT A01 (admit) message has already created the encounter
    if (existingEncounter) {
      existingEncounter.status = 'in-progress';
      existingEncounter.participant = practitioner
        ? [
            {
              individual: createReference(practitioner),
            },
          ]
        : undefined;
      existingEncounter.location = location
        ? [
            {
              location: createReference(location),
            },
          ]
        : undefined;
      // Update period timestamps if provided
      // Handle updates when either startDate or endDate (or both) are provided
      const currentPeriod = existingEncounter.period || {};
      
      // Always update period if either date is provided
      if (startDate || endDate) {
        existingEncounter.period = {
          // Use new start date if provided, otherwise preserve existing start
          start: startDate ?? currentPeriod.start,
          // Use new end date if provided (even when startDate is missing), otherwise preserve existing end or start
          end: endDate ?? currentPeriod.end ?? currentPeriod.start ?? startDate,
        };
      }
      await medplum.updateResource(existingEncounter);
    } else {
      // No existing encounter found - skip silently
      // ADT A08 should only update encounters created by ADT A01
      console.log('ADT A08: No existing encounter found to update. Skipping encounter processing.');
    }
  } else if (eventType === 'A03') {
    // Discharge a patient - update encounter status to finished
    if (existingEncounter) {
      existingEncounter.status = 'finished';
      // Preserve existing start date, update end date (defaults to current time if not provided)
      existingEncounter.period = {
        start: existingEncounter.period?.start,
        end: endDate,
      };
      await medplum.updateResource(existingEncounter);
    } else {
      // If no existing encounter, create a finished encounter
      const encounter: Encounter = {
        resourceType: 'Encounter',
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: encounterClass,
          display: getEncounterClassDisplay(encounterClass),
        },
        subject: createReference(patient),
        participant: practitioner
          ? [
              {
                individual: createReference(practitioner),
              },
            ]
          : undefined,
        location: location
          ? [
              {
                location: createReference(location),
              },
            ]
          : undefined,
        period: {
          start: startDate,
          end: endDate || startDate,
        },
      };

      if (visitNumber) {
        encounter.identifier = [
          {
            system: 'https://example.org/facility/visit-id',
            value: visitNumber,
          },
        ];
      }

      await medplum.createResource(encounter);
    }
  }
}

/**
 * Creates a ClinicalImpression resource from the message notes
 * @param medplum - The Medplum client
 * @param message - The HL7 message
 * @param patient - The Patient resource
 * @param encounter - The Encounter resource
 */
async function createClinicalImpression(
  medplum: MedplumClient,
  message: Hl7Message,
  patient: Patient,
  encounter: Encounter
): Promise<void> {
  // Collect all notes from NTE segments
  const notes: Annotation[] = [];
  const nteSegments = message.getAllSegments('NTE');
  for (const nte of nteSegments) {
    const noteText = nte.getComponent(3, 1);
    if (noteText) {
      notes.push({
        text: noteText,
      });
    }
  }

  // Also collect notes from OBX segments with TX value type
  const obxSegments = message.getAllSegments('OBX');
  for (const obx of obxSegments) {
    const valueType = obx.getComponent(2, 1);
    if (valueType === 'TX' || valueType === 'FT') {
      const noteText = obx.getComponent(5, 1);
      if (noteText) {
        notes.push({
          text: noteText,
        });
      }
    }
  }

  // If no notes found, create a basic clinical impression with placeholder text
  if (notes.length === 0) {
    notes.push({
      text: 'Clinical note from HL7 ORU message',
    });
  }

  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject: createReference(patient),
    encounter: createReference(encounter),
    date: new Date().toISOString(),
    note: notes,
  };

  await medplum.createResource(clinicalImpression);
}

/**
 * Parses an HL7 XCN field into a Practitioner resource
 * @param field - The HL7 field
 * @returns A Practitioner resource
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
 * Parses an HL7 XPN field into a HumanName
 * @param field - The HL7 field
 * @param indexOffset - Offset for component indices (default 0)
 * @returns A HumanName
 */
function parseHl7Name(field: Hl7Field, indexOffset = 0): HumanName {
  const given: string[] = [];
  const givenName = field.getComponent(indexOffset + 2);
  if (givenName?.trim()) {
    given.push(givenName.trim());
  }

  const middleName = field.getComponent(indexOffset + 3);
  if (middleName?.trim()) {
    given.push(middleName.trim());
  }

  const name: HumanName = {
    family: field.getComponent(indexOffset + 1),
    given: given.length > 0 ? given : undefined,
  };

  const suffix = field.getComponent(indexOffset + 4);
  if (suffix) {
    name.suffix = [suffix];
  }

  const prefix = field.getComponent(indexOffset + 5);
  if (prefix) {
    name.prefix = [prefix];
  }

  return name;
}

/**
 * Parses an HL7 gender code (PID-8) into a FHIR Administrative Gender code
 * 
 * Maps HL7v2 gender codes to FHIR Patient.gender values from the Administrative Gender value set:
 * {@link http://hl7.org/fhir/ValueSet/administrative-gender | Administrative Gender Value Set}
 * 
 * Valid FHIR gender codes:
 * - male: Male
 * - female: Female
 * - other: Other
 * - unknown: Unknown
 * 
 * HL7v2 mapping:
 * - M → male
 * - F → female
 * - All other values → unknown
 * 
 * @param gender - The HL7 gender code from PID-8
 * @returns A FHIR Administrative Gender code
 */
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

/**
 * Gets the display name for an encounter class code
 * Maps HL7v2 PV1-2 (Patient Class) codes to FHIR Encounter.class display names.
 * 
 * The codes must be from the FHIR Encounter Class value set:
 * {@link https://terminology.hl7.org/5.1.0/ValueSet-encounter-class.html | Encounter Class Value Set}
 * 
 * Valid codes from the value set:
 * - IMP: inpatient encounter
 * - AMB: ambulatory
 * - OBSENC: observation encounter
 * - EMER: emergency
 * - VR: virtual
 * - HH: home health
 * 
 * @param code - The encounter class code (from PV1-2)
 * @returns The display name for the encounter class
 */
function getEncounterClassDisplay(code: string): string {
  const classMap: Record<string, string> = {
    AMB: 'ambulatory',
    EMER: 'emergency',
    IMP: 'inpatient encounter',
    OBSENC: 'observation encounter',
    VR: 'virtual',
    HH: 'home health',
  };
  // Return mapped display name, or the code itself if not in the value set
  return classMap[code] || code;
}

