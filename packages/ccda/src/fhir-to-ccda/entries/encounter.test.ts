// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Bundle, Composition, Condition, Encounter, EncounterParticipant, Patient } from '@medplum/fhirtypes';
import { OID_ENCOUNTER_ACTIVITIES, OID_ENCOUNTER_LOCATION, OID_PROBLEM_OBSERVATION } from '../../oids';
import { FhirToCcdaConverter } from '../convert';
import { createEncounterEntry } from './encounter';

describe('createEncounterEntry', () => {
  let converter: FhirToCcdaConverter;
  let bundle: Bundle;
  let patient: Patient;

  beforeEach(() => {
    patient = {
      id: 'patient-1',
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        { resource: patient },
        {
          resource: {
            id: 'composition-1',
            resourceType: 'Composition',
            status: 'final',
            type: { text: 'test' },
            date: new Date().toISOString(),
            author: [{ display: 'test' }],
            title: 'test',
            subject: createReference(patient),
            section: [],
          } as Composition,
        },
      ],
    };

    converter = new FhirToCcdaConverter(bundle);
  });

  test('should create basic encounter entry', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      type: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '270427003',
              display: 'Patient-initiated encounter',
            },
          ],
        },
      ],
      period: {
        start: '2024-01-01T10:00:00Z',
        end: '2024-01-01T11:00:00Z',
      },
      identifier: [{ system: 'http://example.org', value: 'encounter-123' }],
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    expect(result.encounter).toBeDefined();
    expect(result.encounter?.length).toBe(1);

    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.['@_classCode']).toBe('ENC');
    expect(encounterEntry?.['@_moodCode']).toBe('EVN');
    expect(encounterEntry?.templateId).toEqual([
      { '@_root': OID_ENCOUNTER_ACTIVITIES },
      { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
    ]);
    expect(encounterEntry?.code?.['@_code']).toBe('270427003');
    expect(encounterEntry?.code?.['@_displayName']).toBe('Patient-initiated encounter');
    expect(encounterEntry?.effectiveTime?.[0]?.low?.['@_value']).toBe('20240101100000+0000');
    expect(encounterEntry?.effectiveTime?.[0]?.high?.['@_value']).toBe('20240101110000+0000');
    expect(encounterEntry?.id).toBeDefined();
  });

  test('should create encounter entry with participants', () => {
    const participants: EncounterParticipant[] = [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'LOC',
                display: 'location',
              },
            ],
          },
        ],
      },
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attender',
              },
            ],
          },
        ],
      },
    ];

    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      participant: participants,
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.participant).toBeDefined();
    expect(encounterEntry?.participant?.length).toBe(2);

    const firstParticipant = encounterEntry?.participant?.[0];
    expect(firstParticipant?.['@_typeCode']).toBe('LOC');
    expect(firstParticipant?.participantRole?.['@_classCode']).toBe('SDLOC');
    expect(firstParticipant?.participantRole?.templateId).toEqual([{ '@_root': OID_ENCOUNTER_LOCATION }]);
    expect(firstParticipant?.participantRole?.code?.['@_code']).toBe('LOC');
    expect(firstParticipant?.participantRole?.code?.['@_displayName']).toBe('location');

    const secondParticipant = encounterEntry?.participant?.[1];
    expect(secondParticipant?.participantRole?.code?.['@_code']).toBe('ATND');
    expect(secondParticipant?.participantRole?.code?.['@_displayName']).toBe('attender');
  });

  test('should create encounter entry with diagnosis', () => {
    const condition: Condition = {
      id: 'condition-1',
      resourceType: 'Condition',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '233604007',
            display: 'Pneumonia',
          },
        ],
      },
      onsetDateTime: '2023-12-25',
      abatementDateTime: '2024-01-15',
      identifier: [{ system: 'http://example.org', value: 'condition-123' }],
    };

    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      diagnosis: [
        {
          condition: createReference(condition),
          use: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                code: 'CC',
                display: 'Chief complaint',
              },
            ],
          },
        },
      ],
    };

    bundle.entry?.push({ resource: condition });

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.entryRelationship).toBeDefined();
    expect(encounterEntry?.entryRelationship?.length).toBe(1);

    const diagnosisEntry = encounterEntry?.entryRelationship?.[0];
    expect(diagnosisEntry?.['@_typeCode']).toBe('REFR');
    expect(diagnosisEntry?.act).toBeDefined();

    const diagnosisAct = diagnosisEntry?.act?.[0];
    expect(diagnosisAct?.['@_classCode']).toBe('ACT');
    expect(diagnosisAct?.['@_moodCode']).toBe('EVN');
    expect(diagnosisAct?.templateId).toEqual([
      { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
      { '@_root': OID_ENCOUNTER_ACTIVITIES },
    ]);
    expect(diagnosisAct?.code?.['@_code']).toBe('29308-4');
    expect(diagnosisAct?.code?.['@_displayName']).toBe('Diagnosis');

    expect(diagnosisAct?.entryRelationship).toBeDefined();
    expect(diagnosisAct?.entryRelationship?.length).toBe(1);

    const observationEntry = diagnosisAct?.entryRelationship?.[0];
    expect(observationEntry?.['@_typeCode']).toBe('SUBJ');
    expect(observationEntry?.observation).toBeDefined();

    const observation = observationEntry?.observation?.[0];
    expect(observation?.['@_classCode']).toBe('OBS');
    expect(observation?.['@_moodCode']).toBe('EVN');
    expect(observation?.templateId).toEqual([
      { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
      { '@_root': OID_PROBLEM_OBSERVATION },
    ]);
    expect(observation?.code?.['@_code']).toBe('282291009');
    expect(observation?.code?.['@_displayName']).toBe('Diagnosis interpretation');
    expect(observation?.statusCode?.['@_code']).toBe('completed');
    // Value structure is dynamic based on mapCodeableConceptToCcdaValue implementation
    expect(observation?.value).toBeDefined();
    expect(observation?.id).toBeDefined();
  });

  test('should skip invalid diagnosis references', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      diagnosis: [
        {
          condition: { reference: 'Condition/nonexistent' },
        },
        {
          condition: { reference: 'Condition/invalid' } as any, // Wrong resource type for testing
        },
      ],
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.entryRelationship).toEqual([]);
  });

  test('should handle encounter without type', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.code).toBeUndefined();
  });

  test('should handle encounter without period', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.effectiveTime).toBeUndefined();
  });

  test('should handle encounter with extension for text reference', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
          valueString: '#encounter-narrative',
        },
      ],
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.text?.reference?.['@_value']).toBe('#encounter-narrative');
  });

  test('should handle encounter without id or identifiers', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.id).toBeDefined();
  });

  test('should handle participants without type', () => {
    const encounter: Encounter = {
      id: 'encounter-1',
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      participant: [
        {
          // Participant without type for testing
        },
      ],
    };

    const result = createEncounterEntry(converter, encounter);

    expect(result).toBeDefined();
    const encounterEntry = result.encounter?.[0];
    expect(encounterEntry?.participant).toBeDefined();
    expect(encounterEntry?.participant?.length).toBe(1);

    const participant = encounterEntry?.participant?.[0];
    expect(participant?.participantRole?.code).toBeUndefined();
  });
});
