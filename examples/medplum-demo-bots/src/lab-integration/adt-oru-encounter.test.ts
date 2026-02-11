// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getReferenceString,
  Hl7Message,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type {
  Bundle,
  Location,
  Practitioner,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dotenv from 'dotenv';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { handler } from './adt-oru-encounter';

dotenv.config({ quiet: true });

describe('ADT-ORU Encounter Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx: any) => {
    const medplum = new MockClient();
    Object.assign(ctx, { medplum });
  });

  afterEach(() => {
    // Clean up if needed
  });

  test('Parse basic ORU message and create Encounter and ClinicalImpression', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(BASIC_ORU_MESSAGE);
    const ack = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Verify ACK is returned with success code (AA = Application Accept)
    expect(ack).toBeDefined();
    const msaSegment = ack.getSegment('MSA');
    expect(msaSegment).toBeDefined();
    const ackCode = msaSegment?.getField(1)?.toString();
    expect(ackCode).toBe('AA');

    // Check patient was created (filter by identifier since MockClient has pre-seeded patients)
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1081',
    });
    expect(patients).toHaveLength(1);
    expect(patients[0]?.name?.[0]?.family).toBe('Doe');
    expect(patients[0]?.name?.[0]?.given?.[0]).toBe('Jane');
    expect(patients[0]?.birthDate).toBe('2001-10-08');
    expect(patients[0]?.gender).toBe('male');

    // Check practitioner was created (filter by identifier)
    const practitioners = await medplum.searchResources('Practitioner', {
      identifier: 'https://example.org/facility/practitioner-id|1467501098',
    });
    expect(practitioners).toHaveLength(1);
    expect(practitioners[0]?.name?.[0]?.family).toBe('Jekyll');
    expect(practitioners[0]?.name?.[0]?.given?.[0]).toBe('Henry');

    // Check location was created (filter by name)
    const locations = await medplum.searchResources('Location', {
      name: 'Sample Hospital',
    });
    expect(locations.length).toBeGreaterThanOrEqual(1);
    const location = locations.find((l) => l.name === 'Sample Hospital');
    expect(location).toBeDefined();

    // Check encounter was created (filter by patient subject)
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.status).toBe('finished');
    expect(encounters[0]?.subject?.reference).toBe(getReferenceString(patients[0]));
    expect(encounters[0]?.participant?.[0]?.individual?.reference).toBe(getReferenceString(practitioners[0]));
    expect(encounters[0]?.location?.[0]?.location?.reference).toBe(getReferenceString(location!));

    // Check clinical impression was created
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {});
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.status).toBe('completed');
    expect(clinicalImpressions[0]?.subject?.reference).toBe(getReferenceString(patients[0]));
    expect(clinicalImpressions[0]?.encounter?.reference).toBe(getReferenceString(encounters[0]));
    expect(clinicalImpressions[0]?.note).toBeDefined();
    expect(clinicalImpressions[0]?.note?.length).toBeGreaterThan(0);
  });

  test('Parse ORU message with multiple notes', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MULTIPLE_NOTES_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {});
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.note?.length).toBeGreaterThanOrEqual(2);
  });

  test('Parse ORU message with TX OBX segments as notes', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(OBX_TEXT_NOTES_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {});
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.note?.length).toBeGreaterThan(0);
    // Should include notes from OBX TX segments
    const noteTexts = clinicalImpressions[0]?.note?.map((n) => n.text).join(' ') || '';
    expect(noteTexts).toContain('Clinical observation note');
  });

  test('Case-insensitive practitioner matching', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // Create a practitioner with lowercase name
    const existingPractitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [
        {
          family: 'hyde',
          given: ['edward'],
        },
      ],
      identifier: [
        {
          system: 'https://example.org/facility/practitioner-id',
          value: 'DOC123',
        },
      ],
    });

    // Parse message with uppercase name but same identifier
    const msg = Hl7Message.parse(PRACTITIONER_CASE_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should reuse existing practitioner with same identifier (filter by identifier)
    const practitioners = await medplum.searchResources('Practitioner', {
      identifier: 'https://example.org/facility/practitioner-id|DOC123',
    });
    expect(practitioners).toHaveLength(1);
    expect(practitioners[0]?.id).toBe(existingPractitioner.id);
  });

  test('Case-insensitive location matching', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // Create a location with lowercase name
    const existingLocation = await medplum.createResource<Location>({
      resourceType: 'Location',
      name: 'sample hospital',
      identifier: [
        {
          system: 'https://example.org/facility/location-id',
          value: 'sample hospital',
        },
      ],
    });

    // Parse message with uppercase name
    const msg = Hl7Message.parse(LOCATION_CASE_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should reuse existing location (filter by identifier)
    const locations = await medplum.searchResources('Location', {
      identifier: 'https://example.org/facility/location-id|sample hospital',
    });
    expect(locations).toHaveLength(1);
    expect(locations[0]?.id).toBe(existingLocation.id);
  });

  test('Multiple practitioners from different segments', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MULTIPLE_PRACTITIONERS_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Check that practitioners with expected identifiers were created
    const pract1 = await medplum.searchResources('Practitioner', {
      identifier: 'https://example.org/facility/practitioner-id|DOC001',
    });
    const pract2 = await medplum.searchResources('Practitioner', {
      identifier: 'https://example.org/facility/practitioner-id|DOC002',
    });
    const pract3 = await medplum.searchResources('Practitioner', {
      identifier: 'https://example.org/facility/practitioner-id|DOC003',
    });
    // Should have at least 2 practitioners (from PV1 and ORC/OBR)
    const totalPractitioners = pract1.length + pract2.length + pract3.length;
    expect(totalPractitioners).toBeGreaterThanOrEqual(2);
  });

  test('Encounter with missing dates uses start date for end', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MISSING_END_DATE_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Filter by patient since MockClient has pre-seeded encounters
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1087',
    });
    expect(patients).toHaveLength(1);
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.period?.start).toBeDefined();
    expect(encounters[0]?.period?.end).toBe(encounters[0]?.period?.start);
  });

  test('Encounter with default encounter class (AMB)', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(EMERGENCY_ENCOUNTER_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Filter by patient since MockClient has pre-seeded encounters
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1088',
    });
    expect(patients).toHaveLength(1);
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    // PV1-2 contains location (non-standard), so encounter class defaults to AMB
    expect(encounters[0]?.class?.code).toBe('AMB');
  });

  test('Clinical impression created even without notes', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(NO_NOTES_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {});
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.note?.length).toBe(1);
    expect(clinicalImpressions[0]?.note?.[0]?.text).toBe('Clinical note from HL7 ORU message');
  });

  test('Patient with missing optional fields', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MINIMAL_PATIENT_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Filter by identifier since MockClient has pre-seeded patients
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1090',
    });
    expect(patients).toHaveLength(1);
    expect(patients[0]?.name?.[0]?.family).toBe('Doe');
    // Gender should default to unknown
    expect(patients[0]?.gender).toBe('unknown');
  });

  test('Returns ACK with error code for unsupported message type', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(UNSUPPORTED_MESSAGE_TYPE);
    const ack = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should return an ACK message with error code (AE = Application Error)
    expect(ack).toBeDefined();
    const msaSegment = ack.getSegment('MSA');
    expect(msaSegment).toBeDefined();
    const ackCode = msaSegment?.getField(1)?.toString();
    expect(ackCode).toBe('AE');
  });

  test('Process ADT A01 (Admit) message', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Check patient was created (filter by identifier)
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);
    expect(patients[0]?.name?.[0]?.family).toBe('Doe');
    expect(patients[0]?.name?.[0]?.given?.[0]).toBe('Jane');

    // Check encounter was created with in-progress status (filter by patient)
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.status).toBe('in-progress');
    expect(encounters[0]?.subject?.reference).toBe(getReferenceString(patients[0]));

    // Verify period timestamps are set
    expect(encounters[0]?.period?.start).toBeDefined();
    expect(encounters[0]?.period?.end).toBeDefined();
  });

  test('Process ADT A08 (Update) message', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First create an encounter with A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Then update with A08
    const updateMsg = Hl7Message.parse(ADT_A08_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: updateMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient and filter encounters by patient
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    // Should still have only one encounter (updated)
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.status).toBe('in-progress');
  });

  test('ADT A08 update with only endDate preserves startDate', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First create an encounter with A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    const originalStartDate = encountersBefore[0]?.period?.start;
    const originalEndDate = encountersBefore[0]?.period?.end;

    // Update with A08 that has only endDate (no startDate in PV1-44)
    const updateMsg = Hl7Message.parse(ADT_A08_END_DATE_ONLY_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: updateMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);

    // Start date should be preserved
    expect(encounters[0]?.period?.start).toBe(originalStartDate);

    // End date should be updated to the new value
    expect(encounters[0]?.period?.end).toBeDefined();
    expect(encounters[0]?.period?.end).not.toBe(originalEndDate);
  });

  test('ADT A08 update with only startDate preserves endDate', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First create an encounter with A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    const originalStartDate = encountersBefore[0]?.period?.start;
    const originalEndDate = encountersBefore[0]?.period?.end;

    // Update with A08 that has only startDate (no endDate in PV1-45)
    const updateMsg = Hl7Message.parse(ADT_A08_START_DATE_ONLY_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: updateMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);

    // Start date should be updated
    expect(encounters[0]?.period?.start).toBeDefined();
    expect(encounters[0]?.period?.start).not.toBe(originalStartDate);

    // End date should be preserved
    expect(encounters[0]?.period?.end).toBe(originalEndDate);
  });

  test('ADT A08 does not create new encounter if none exists', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // Process A08 without creating an encounter first
    const updateMsg = Hl7Message.parse(ADT_A08_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: updateMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    // Should NOT create a new encounter - A08 only updates existing encounters
    // Assumes ADT A01 has already created the encounter
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(0);
  });

  test('Process ADT A03 (Discharge) message', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First create an encounter with A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    const originalStartDate = encountersBefore[0]?.period?.start;

    // Then discharge with A03
    const dischargeMsg = Hl7Message.parse(ADT_A03_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: dischargeMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Encounter should be finished
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.status).toBe('finished');

    // Start date should be preserved
    expect(encounters[0]?.period?.start).toBe(originalStartDate);

    // End date should be updated to discharge date
    expect(encounters[0]?.period?.end).toBeDefined();
    expect(encounters[0]?.period?.end).not.toBe(encounters[0]?.period?.start);
  });

  test('Skip unsupported ADT message subtypes', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(ADT_A30_MESSAGE);
    // Should not throw, just skip
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering (A30 uses patient 1094)
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1094',
    });

    // No encounters should be created for unsupported subtypes (filter by patient)
    const encounters = patients.length > 0
      ? await medplum.searchResources('Encounter', { subject: getReferenceString(patients[0]) })
      : [];
    expect(encounters).toHaveLength(0);
  });

  test('Returns AE ACK on missing PID segment', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MISSING_PID_MESSAGE);
    const ack = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should return ACK with error code (AE = Application Error)
    expect(ack).toBeDefined();
    const msaSegment = ack.getSegment('MSA');
    expect(msaSegment).toBeDefined();
    const ackCode = msaSegment?.getField(1)?.toString();
    expect(ackCode).toBe('AE');
  });

  test('Returns AE ACK on missing PV1 segment', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    const msg = Hl7Message.parse(MISSING_PV1_MESSAGE);
    const ack = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should return ACK with error code (AE = Application Error)
    expect(ack).toBeDefined();
    const msaSegment = ack.getSegment('MSA');
    expect(msaSegment).toBeDefined();
    const ackCode = msaSegment?.getField(1)?.toString();
    expect(ackCode).toBe('AE');
  });

  test('ORU message links to existing ADT encounter by visit number', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First create an encounter with ADT A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Get patient for filtering (ADT and ORU use patient 1093)
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encountersBefore).toHaveLength(1);
    const encounterId = encountersBefore[0]?.id;

    // Then process ORU message with same visit number
    const oruMsg = Hl7Message.parse(ORU_WITH_VISIT_NUMBER_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: oruMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should still have only one encounter (the same one)
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.id).toBe(encounterId);

    // Clinical impression should be linked to the same encounter
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {
      subject: getReferenceString(patients[0]),
    });
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.encounter?.reference).toBe(getReferenceString(encounters[0]));
  });

  test('ORU message creates new encounter when no matching ADT encounter exists', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // Process ORU message without creating an ADT encounter first
    const oruMsg = Hl7Message.parse(BASIC_ORU_MESSAGE);
    const ack = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: oruMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Verify ACK is returned
    expect(ack).toBeDefined();
    const msaSegment = ack.getSegment('MSA');
    expect(msaSegment).toBeDefined();
    const ackCode = msaSegment?.getField(1)?.toString();
    expect(ackCode).toBe('AA');

    // Should create a new encounter (filter by patient since MockClient has pre-seeded encounters)
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1081',
    });
    expect(patients).toHaveLength(1);
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);

    // Verify encounter properties
    const encounter = encounters[0];
    expect(encounter?.status).toBe('finished');
    expect(encounter?.period?.start).toBeDefined();
    expect(encounter?.period?.end).toBeDefined();

    // Verify patient is linked
    expect(encounter?.subject?.reference).toBe(getReferenceString(patients[0]));

    // Verify clinical impression is linked to the encounter (filter by patient)
    const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {
      subject: getReferenceString(patients[0]),
    });
    expect(clinicalImpressions).toHaveLength(1);
    expect(clinicalImpressions[0]?.encounter?.reference).toBe(getReferenceString(encounter));
  });

  test('Encounter with blank dates defaults to time received', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const beforeTime = new Date();

    const msg = Hl7Message.parse(BLANK_DATES_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: msg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    const afterTime = new Date();

    // Check patient was created
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1095',
    });
    expect(patients).toHaveLength(1);

    // Check encounter was created with start date defaulting to time received
    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.period?.start).toBeDefined();

    // Verify the start date is within the time window of when the message was processed
    const startDate = new Date(encounters[0]?.period?.start as string);
    expect(startDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000); // Allow 1s tolerance
    expect(startDate.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);

    // End date should equal start date when both are blank
    expect(encounters[0]?.period?.end).toBe(encounters[0]?.period?.start);
  });

  test('ADT A03 with blank end date defaults to time received', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First, create an encounter with ADT A01
    const admitMsg = Hl7Message.parse(ADT_A01_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Verify encounter was created
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1093',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encountersBefore).toHaveLength(1);
    const originalEndDate = encountersBefore[0]?.period?.end;

    // Now send A03 discharge with blank end date
    const beforeTime = new Date();
    const dischargeMsg = Hl7Message.parse(ADT_A03_BLANK_END_DATE_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: dischargeMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);
    const afterTime = new Date();

    // Check encounter was updated
    const encountersAfter = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encountersAfter).toHaveLength(1);
    expect(encountersAfter[0]?.status).toBe('finished');

    // End date should be updated to time received (not the original end date)
    expect(encountersAfter[0]?.period?.end).toBeDefined();
    expect(encountersAfter[0]?.period?.end).not.toBe(originalEndDate);

    // Verify end date is within the time window of processing
    const endDate = new Date(encountersAfter[0]?.period?.end as string);
    expect(endDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
    expect(endDate.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);

    // Start date should be preserved
    expect(encountersAfter[0]?.period?.start).toBe(encountersBefore[0]?.period?.start);
  });

  test('ADT A03 uses time-window matching when no visit number', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;

    // First, create an encounter with ADT A01 (no visit number)
    const admitMsg = Hl7Message.parse(ADT_A01_NO_VISIT_NUMBER_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: admitMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Verify encounter was created
    const patients = await medplum.searchResources('Patient', {
      identifier: 'https://example.org/facility/patient-id|1096',
    });
    expect(patients).toHaveLength(1);

    const encountersBefore = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encountersBefore).toHaveLength(1);
    expect(encountersBefore[0]?.status).toBe('in-progress');

    // Now send A03 discharge (no visit number - should match by time window)
    const dischargeMsg = Hl7Message.parse(ADT_A03_NO_VISIT_NUMBER_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: dischargeMsg,
      contentType: 'x-application/hl7-v2+er7',
      secrets: {},
    } as BotEvent<Hl7Message>);

    // Should still have only 1 encounter (updated, not created new)
    const encountersAfter = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patients[0]),
    });
    expect(encountersAfter).toHaveLength(1);
    expect(encountersAfter[0]?.status).toBe('finished');
    expect(encountersAfter[0]?.id).toBe(encountersBefore[0]?.id);
  });
});

// Test message samples with fake data
// PV1 segment field positions (NON-STANDARD): F1=set id, F2=location (not patient class!), F3=other
// F19=visit number, F44=admit date, F45=discharge date
// For ORU messages without doc: 41 pipes after F2 location for empty F3-F43 and separator before F44, then dates in F44-F45
// For ORU messages with doc in F7: location in F2, then pipes to F7, doc, pipes to F44, then dates
const BASIC_ORU_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG001|T|2.3|1
PID|1|1081|aut1081||Doe^Jane^^^^^||20011008|M|||^^^^^USA||^PRN^PH|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5518||||||||||1467501098^Jekyll^Henry
OBX|1|TX|NOTE^Clinical Note^L||Clinical observation note||||||F|||
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5518|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Patient presents with routine checkup.`;

const MULTIPLE_NOTES_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG002|T|2.3|1
PID|1|1082|aut1082||Doe^John^^^^^||20020515|F|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5519||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5519|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|First note about patient condition.
NTE|2|A|Second note with additional observations.`;

const OBX_TEXT_NOTES_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG003|T|2.3|1
PID|1|1083|aut1083||Smith^Bob^^^^^||19900101|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5520||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5520|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
OBX|1|TX|NOTE^Clinical Note^L||Clinical observation note||||||F|||`;

// PV1-2 location, PV1-7 attending doctor (DOC123)
const PRACTITIONER_CASE_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG004|T|2.3|1
PID|1|1084|aut1084||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||DOC123^HYDE^EDWARD||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5521||||||||||DOC123^HYDE^EDWARD
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5521|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Test note.`;

// Location in F2 with different case (SAMPLE HOSPITAL vs sample hospital)
const LOCATION_CASE_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG005|T|2.3|1
PID|1|1085|aut1085||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|SAMPLE HOSPITAL|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5522||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5522|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Test note.`;

// PV1-2 location, PV1-7 attending doctor (DOC001), ORC-12 (DOC002), OBR-16 (DOC003)
// OBR field positions: F1=SetID, F2=Placer, F3=Filler, F4=Code, F5-F6=empty, F7=ObsDate, F8=ObsEndDate, F9-F15=empty, F16=OrderingProvider
const MULTIPLE_PRACTITIONERS_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG006|T|2.3|1
PID|1|1086|aut1086||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||DOC001^Jekyll^Henry||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5523||||||||||DOC002^Hyde^Edward
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5523|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000||||||||DOC003^Watson^John|||||||||F
NTE|1|A|Test note.`;

const MISSING_END_DATE_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG007|T|2.3|1
PID|1|1087|aut1087||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|
ORC|RE|5524||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5524|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Test note.`;

// Note: Using Sample Hospital in F2 (location), encounter class defaults to AMB
const EMERGENCY_ENCOUNTER_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG008|T|2.3|1
PID|1|1088|aut1088||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5525||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5525|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Emergency visit note.`;

const NO_NOTES_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG009|T|2.3|1
PID|1|1089|aut1089||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5526||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5526|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F`;

const MINIMAL_PATIENT_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG010|T|2.3|1
PID|1|1090|aut1090||Doe^Jane^^^^^|||||||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000
ORC|RE|5527||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5527|||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000|||||||||||||||||F
NTE|1|A|Test note.`;

const UNSUPPORTED_MESSAGE_TYPE = `MSH|^~\\&|||||20250826132029||MDM^T01|MSG011|T|2.3|1
PID|1|1091|aut1091||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000`;

// ADT messages: Location in F2, 16 pipes from F3 to F19 (visit number), 25 pipes from F19 to F44, dates in F44-F45
// Using standard HL7 DTM format: YYYYMMDDHHMMSS
// Pipe count: F3|F4|F5|F6|F7|F8|F9|F10|F11|F12|F13|F14|F15|F16|F17|F18|F19 = 16 pipes from F3 to F19
const ADT_A01_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A01|MSG014|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826132029|20250826132029
ORC|RE|5529||||||||||1467501098^Jekyll^Henry`;

const ADT_A08_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A08|MSG015|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826132029|20250826132029
ORC|RE|5530||||||||||1467501098^Jekyll^Henry`;

const ADT_A03_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A03|MSG016|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826132029|20250826143029
ORC|RE|5531||||||||||1467501098^Jekyll^Henry`;

const ADT_A30_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A30|MSG017|T|2.3|1
PID|1|1094|aut1094||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000`;

const MISSING_PID_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG012|T|2.3|1
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||2025-08-26 13:20:29.000|2025-08-26 13:20:29.000`;

const MISSING_PV1_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG013|T|2.3|1
PID|1|1092|aut1092||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
ORC|RE|5528||||||||||1467501098^Jekyll^Henry`;

// ADT A08 message with only endDate (PV1-45) - no startDate in PV1-44
// Location in F2, 16 pipes from F3 to F19, VISIT001, 26 pipes from F19 to F45 (empty F44), F45=date
const ADT_A08_END_DATE_ONLY_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A08|MSG018|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001||||||||||||||||||||||||||20250826150000
ORC|RE|5532||||||||||1467501098^Jekyll^Henry`;

// ADT A08 message with only startDate (PV1-44) - no endDate in PV1-45
// Location in F2, 16 pipes from F3 to F19, VISIT001, 25 pipes from F19 to F44=date, then |F45 (empty)
const ADT_A08_START_DATE_ONLY_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A08|MSG019|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826110000|
ORC|RE|5533||||||||||1467501098^Jekyll^Henry`;

// ORU message with visit number matching ADT encounter
// Location in F2, 16 pipes from F3 to F19 (visit number), 25 pipes from F19 to F44, F44-F45=dates
const ORU_WITH_VISIT_NUMBER_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG020|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826132029|20250826132029
ORC|RE|5534||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5534|||20250826132029|20250826132029|||||||||||||||||F
NTE|1|A|Lab results linked to ADT encounter.`;

// ORU message with blank dates in PV1-44 and PV1-45 (should default to time received)
const BLANK_DATES_MESSAGE = `MSH|^~\\&|||||20250826132029||ORU^R01|MSG021|T|2.3|1
PID|1|1095|aut1095||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]
ORC|RE|5535||||||||||1467501098^Jekyll^Henry
OBR|1|707196e4-4aee-4fb1-bb28-7c1b6d1004d0||^5535|||20250826132029|20250826132029|||||||||||||||||F
NTE|1|A|Message with blank encounter dates.`;

// ADT A03 message with blank end date (PV1-45) - should default to time received
// Has visit number in F19 for matching, start date in F44, but no end date in F45
const ADT_A03_BLANK_END_DATE_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A03|MSG022|T|2.3|1
PID|1|1093|aut1093||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]||||||||||||||||VISIT001|||||||||||||||||||||||||20250826132029|
ORC|RE|5536||||||||||1467501098^Jekyll^Henry`;

// ADT A01 message without visit number (for time-window matching test)
const ADT_A01_NO_VISIT_NUMBER_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A01|MSG023|T|2.3|1
PID|1|1096|aut1096||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||20250826132029|20250826132029
ORC|RE|5537||||||||||1467501098^Jekyll^Henry`;

// ADT A03 message without visit number (for time-window matching test)
const ADT_A03_NO_VISIT_NUMBER_MESSAGE = `MSH|^~\\&|||||20250826132029||ADT^A03|MSG024|T|2.3|1
PID|1|1096|aut1096||Doe^Jane^^^^^||20011008|M|||^^^^^USA|||||||||
PV1|1|Sample Hospital|^^^[OUT]|||||||||||||||||||||||||||||||||||||||||20250826132029|
ORC|RE|5538||||||||||1467501098^Jekyll^Henry`;

