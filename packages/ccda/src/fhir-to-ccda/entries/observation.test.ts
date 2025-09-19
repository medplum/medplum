// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Bundle, Composition, Observation, Patient } from '@medplum/fhirtypes';
import {
  OID_ASSESSMENT_SCALE_OBSERVATION,
  OID_ASSESSMENT_SCALE_SUPPORTING_OBSERVATION,
  OID_BASIC_INDUSTRY_OBSERVATION,
  OID_BASIC_OCCUPATION_OBSERVATION,
  OID_BIRTH_SEX,
  OID_DISABILITY_STATUS_OBSERVATION,
  OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION,
  OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER,
  OID_PREGNANCY_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_OBSERVATION,
  OID_RESULT_OBSERVATION,
  OID_SELF_CARE_ACTIVITIES_ADL_AND_IADL,
  OID_SEX_OBSERVATION,
  OID_SMOKING_STATUS_OBSERVATION,
  OID_TOBACCO_USE_OBSERVATION,
  OID_TRIBAL_AFFILIATION_OBSERVATION,
  OID_VITAL_SIGNS_OBSERVATION,
  OID_VITAL_SIGNS_ORGANIZER,
} from '../../oids';
import {
  LOINC_ADMINISTRATIVE_SEX,
  LOINC_BIRTH_SEX,
  LOINC_DISABILITY_STATUS,
  LOINC_FUNCTIONAL_STATUS_ASSESSMENT_NOTE,
  LOINC_HISTORY_OF_OCCUPATION,
  LOINC_HISTORY_OF_OCCUPATION_INDUSTRY,
  LOINC_HISTORY_OF_TOBACCO_USE,
  LOINC_PREGNANCY_STATUS,
  LOINC_TOBACCO_SMOKING_STATUS,
  LOINC_TRIBAL_AFFILIATION,
} from '../../systems';
import { FhirToCcdaConverter } from '../convert';
import {
  createCcdaObservation,
  createObservationEntry,
  createVitalSignsOrganizer,
  mapObservationTemplateId,
  mapObservationValue,
  mapOrganizerTemplateId,
  mapReferenceRange,
  mapReferenceRangeArray,
} from './observation';

describe('observation entry functions', () => {
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

  describe('createObservationEntry', () => {
    test('should create direct observation entry', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
      };

      const result = createObservationEntry(converter, observation);

      expect(result).toBeDefined();
      expect(result.observation).toBeDefined();
      expect(result.observation?.length).toBe(1);
      expect(result.organizer).toBeUndefined();
    });

    test('should create organizer entry when observation has components', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Blood pressure panel',
            },
          ],
        },
        component: [
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8480-6',
                  display: 'Systolic blood pressure',
                },
              ],
            },
            valueQuantity: {
              value: 120,
              unit: 'mmHg',
            },
          },
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8462-4',
                  display: 'Diastolic blood pressure',
                },
              ],
            },
            valueQuantity: {
              value: 80,
              unit: 'mmHg',
            },
          },
        ],
      };

      const result = createObservationEntry(converter, observation);

      expect(result).toBeDefined();
      expect(result.organizer).toBeDefined();
      expect(result.organizer?.length).toBe(1);
      expect(result.observation).toBeUndefined();
    });

    test('should create organizer entry when observation has hasMember', () => {
      const childObs: Observation = {
        id: 'child-obs',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
      };

      bundle.entry?.push({ resource: childObs });

      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Vital signs panel',
            },
          ],
        },
        hasMember: [createReference(childObs)],
      };

      const result = createObservationEntry(converter, observation);

      expect(result).toBeDefined();
      expect(result.organizer).toBeDefined();
      expect(result.organizer?.length).toBe(1);
      expect(result.observation).toBeUndefined();
    });
  });

  describe('createVitalSignsOrganizer', () => {
    test('should create organizer with components', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Blood pressure panel',
            },
          ],
        },
        component: [
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8480-6',
                  display: 'Systolic blood pressure',
                },
              ],
            },
            valueQuantity: {
              value: 120,
              unit: 'mmHg',
            },
          },
        ],
        effectiveDateTime: '2024-01-01T10:00:00Z',
        identifier: [{ value: 'obs-123' }],
      };

      const result = createVitalSignsOrganizer(converter, observation);

      expect(result).toBeDefined();
      expect(result['@_classCode']).toBe('CLUSTER');
      expect(result['@_moodCode']).toBe('EVN');
      expect(result.templateId).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.code).toBeDefined();
      expect(result.statusCode?.['@_code']).toBe('completed');
      expect(result.effectiveTime?.[0]?.['@_value']).toBe('20240101100000+0000');
      expect(result.component).toBeDefined();
      expect(result.component?.length).toBe(1);
    });

    test('should create organizer with hasMember observations', () => {
      const childObs1: Observation = {
        id: 'child-obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
      };

      const childObs2: Observation = {
        id: 'child-obs-2',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Blood pressure panel',
            },
          ],
        },
        component: [
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8480-6',
                  display: 'Systolic blood pressure',
                },
              ],
            },
            valueQuantity: {
              value: 120,
              unit: 'mmHg',
            },
          },
        ],
      };

      bundle.entry?.push({ resource: childObs1 }, { resource: childObs2 });

      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'panel-code',
              display: 'Vital signs panel',
            },
          ],
        },
        hasMember: [createReference(childObs1), createReference(childObs2)],
      };

      const result = createVitalSignsOrganizer(converter, observation);

      expect(result).toBeDefined();
      expect(result.component).toBeDefined();
      expect(result.component?.length).toBe(2); // One direct obs + one with component
    });

    test('should skip invalid hasMember references', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'panel-code',
              display: 'Vital signs panel',
            },
          ],
        },
        hasMember: [
          { reference: 'Observation/nonexistent' },
          createReference(patient as unknown as Observation), // Wrong resource type
        ],
      };

      const result = createVitalSignsOrganizer(converter, observation);

      expect(result).toBeDefined();
      expect(result.component).toBeDefined();
      expect(result.component?.length).toBe(0);
    });
  });

  describe('createCcdaObservation', () => {
    test('should create basic observation', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
        effectiveDateTime: '2024-01-01T10:00:00Z',
        identifier: [{ value: 'obs-123' }],
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      expect(result['@_classCode']).toBe('OBS');
      expect(result['@_moodCode']).toBe('EVN');
      expect(result.templateId).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.code).toBeDefined();
      expect(result.statusCode?.['@_code']).toBe('completed');
      expect(result.effectiveTime).toBeDefined();
      expect(result.value).toBeDefined();
    });

    test('should handle pregnancy status special case', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: LOINC_PREGNANCY_STATUS,
              display: 'Pregnancy status',
            },
          ],
        },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '77386006',
              display: 'Pregnant',
            },
          ],
        },
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      expect(result.code?.['@_code']).toBe('ASSERTION');
      expect(result.code?.['@_codeSystem']).toBe('2.16.840.1.113883.5.4');
    });

    test('should handle observation with hasMember', () => {
      const childObs: Observation = {
        id: 'child-obs',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
      };

      bundle.entry?.push({ resource: childObs });

      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'panel-code',
              display: 'Panel',
            },
          ],
        },
        hasMember: [createReference(childObs)],
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      expect(result.entryRelationship).toBeDefined();
      expect(result.entryRelationship?.length).toBe(1);
      expect(result.entryRelationship?.[0]['@_typeCode']).toBe('COMP');
      expect(result.entryRelationship?.[0].observation).toBeDefined();
    });

    test('should skip invalid hasMember references in createCcdaObservation', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'panel-code',
              display: 'Panel',
            },
          ],
        },
        hasMember: [
          { reference: 'Observation/nonexistent' },
          createReference(patient as unknown as Observation), // Wrong resource type
        ],
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      expect(result.entryRelationship).toBeDefined();
      expect(result.entryRelationship?.length).toBe(0);
    });

    test('should handle observation with component', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Blood pressure panel',
            },
          ],
        },
      };

      const component = {
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8480-6',
              display: 'Systolic blood pressure',
            },
          ],
        },
        valueQuantity: {
          value: 120,
          unit: 'mmHg',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
            valueString: '#component-text',
          },
        ],
      };

      const result = createCcdaObservation(converter, observation, component);

      expect(result).toBeDefined();
      expect(result.code?.['@_code']).toBe('8480-6');
      expect(result.code?.['@_displayName']).toBe('Systolic blood pressure');
      expect(result.value).toBeDefined();
      expect(result.text?.reference?.['@_value']).toBe('#component-text');
    });

    test('should handle observation with reference range', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
        referenceRange: [
          {
            low: { value: 60, unit: 'bpm' },
            high: { value: 100, unit: 'bpm' },
          },
        ],
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      expect(result.referenceRange).toBeDefined();
      expect(result.referenceRange?.length).toBe(1);
    });

    test('should handle observation with performer', () => {
      const observation: Observation = {
        id: 'obs-1',
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            },
          ],
        },
        valueQuantity: {
          value: 80,
          unit: 'bpm',
        },
        performer: [{ display: 'Dr. Smith' }],
        effectiveDateTime: '2024-01-01T10:00:00Z',
      };

      const result = createCcdaObservation(converter, observation);

      expect(result).toBeDefined();
      // Note: mapAuthor returns undefined for display-only performers
      expect(result.author).toBeUndefined();
    });
  });

  describe('mapOrganizerTemplateId', () => {
    test('should return functional status organizer template for d5 code', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ code: 'd5' }],
        },
        subject: createReference(patient),
      };

      const result = mapOrganizerTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER, '@_extension': '2014-06-09' },
        { '@_root': OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER },
      ]);
    });

    test('should return default vital signs organizer template', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ code: 'other-code' }],
        },
        subject: createReference(patient),
      };

      const result = mapOrganizerTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_VITAL_SIGNS_ORGANIZER },
        { '@_root': OID_VITAL_SIGNS_ORGANIZER, '@_extension': '2015-08-01' },
      ]);
    });
  });

  describe('mapObservationTemplateId', () => {
    test('should map tobacco smoking status', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_TOBACCO_SMOKING_STATUS }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_SMOKING_STATUS_OBSERVATION },
        { '@_root': OID_SMOKING_STATUS_OBSERVATION, '@_extension': '2014-06-09' },
      ]);
    });

    test('should map history of tobacco use', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_HISTORY_OF_TOBACCO_USE }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_TOBACCO_USE_OBSERVATION },
        { '@_root': OID_TOBACCO_USE_OBSERVATION, '@_extension': '2014-06-09' },
      ]);
    });

    test('should map administrative sex', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_ADMINISTRATIVE_SEX }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_SEX_OBSERVATION, '@_extension': '2023-06-28' }]);
    });

    test('should map birth sex', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_BIRTH_SEX }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_BIRTH_SEX }, { '@_root': OID_BIRTH_SEX, '@_extension': '2016-06-01' }]);
    });

    test('should map disability status', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_DISABILITY_STATUS }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_DISABILITY_STATUS_OBSERVATION },
        { '@_root': OID_DISABILITY_STATUS_OBSERVATION, '@_extension': '2023-05-01' },
      ]);
    });

    test('should map history of occupation', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_HISTORY_OF_OCCUPATION }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_BASIC_OCCUPATION_OBSERVATION, '@_extension': '2023-05-01' }]);
    });

    test('should map history of occupation industry', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_HISTORY_OF_OCCUPATION_INDUSTRY }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_BASIC_INDUSTRY_OBSERVATION, '@_extension': '2023-05-01' }]);
    });

    test('should map pregnancy status', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_PREGNANCY_STATUS }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_PREGNANCY_OBSERVATION }]);
    });

    test('should map tribal affiliation', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: LOINC_TRIBAL_AFFILIATION }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_TRIBAL_AFFILIATION_OBSERVATION, '@_extension': '2023-05-01' }]);
    });

    test('should map d5 functional status with component', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'd5' }],
        },
      };

      const component = {
        code: {
          coding: [{ code: LOINC_FUNCTIONAL_STATUS_ASSESSMENT_NOTE }],
        },
      };

      const result = mapObservationTemplateId(observation, component);

      expect(result).toEqual([{ '@_root': OID_SELF_CARE_ACTIVITIES_ADL_AND_IADL }]);
    });

    test('should map d5 functional status without matching component', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'd5' }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION, '@_extension': '2014-06-09' },
        { '@_root': OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION },
      ]);
    });

    test('should map exam category', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'some-exam-code' }],
        },
        category: [
          {
            coding: [{ code: 'exam' }],
          },
        ],
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION },
        { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION, '@_extension': '2014-06-09' },
      ]);
    });

    test('should map laboratory category', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'lab-code' }],
        },
        category: [
          {
            coding: [{ code: 'laboratory' }],
          },
        ],
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_RESULT_OBSERVATION },
        { '@_root': OID_RESULT_OBSERVATION, '@_extension': '2015-08-01' },
      ]);
    });

    test('should map survey category with hasMember', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'survey-code' }],
        },
        category: [
          {
            coding: [{ code: 'survey' }],
          },
        ],
        hasMember: [{ reference: 'Observation/child' }],
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_ASSESSMENT_SCALE_OBSERVATION, '@_extension': '2022-06-01' }]);
    });

    test('should map survey category without hasMember', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'survey-code' }],
        },
        category: [
          {
            coding: [{ code: 'survey' }],
          },
        ],
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([{ '@_root': OID_ASSESSMENT_SCALE_SUPPORTING_OBSERVATION }]);
    });

    test('should return default template', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: {
          coding: [{ code: 'other-code' }],
        },
      };

      const result = mapObservationTemplateId(observation);

      expect(result).toEqual([
        { '@_root': OID_VITAL_SIGNS_OBSERVATION },
        { '@_root': OID_VITAL_SIGNS_OBSERVATION, '@_extension': '2014-06-09' },
      ]);
    });
  });

  describe('mapObservationValue', () => {
    test('should map valueQuantity', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code: 'test' }] },
        valueQuantity: {
          value: 120,
          unit: 'mmHg',
        },
      };

      const result = mapObservationValue(observation);

      expect(result).toEqual({
        '@_xsi:type': 'PQ',
        '@_unit': 'mmHg',
        '@_value': '120',
      });
    });

    test('should map valueCodeableConcept', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code: 'test' }] },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '442102008',
              display: 'Smoker',
            },
          ],
        },
      };

      const result = mapObservationValue(observation);

      expect(result).toBeDefined();
      expect(result?.['@_xsi:type']).toBe('CD');
    });

    test('should map valueString', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code: 'test' }] },
        valueString: 'Test result',
      };

      const result = mapObservationValue(observation);

      expect(result).toEqual({
        '@_xsi:type': 'ST',
        '#text': 'Test result',
      });
    });

    test('should map valueInteger', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code: 'test' }] },
        valueInteger: 42,
      };

      const result = mapObservationValue(observation);

      expect(result).toEqual({
        '@_xsi:type': 'INT',
        '@_value': '42',
      });
    });

    test('should return undefined when no value', () => {
      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code: 'test' }] },
      };

      const result = mapObservationValue(observation);

      expect(result).toBeUndefined();
    });
  });

  describe('mapReferenceRangeArray', () => {
    test('should map reference ranges', () => {
      const referenceRange = [
        {
          low: { value: 60, unit: 'bpm' },
          high: { value: 100, unit: 'bpm' },
        },
        {
          text: 'Normal range',
        },
      ];

      const result = mapReferenceRangeArray(referenceRange);

      expect(result).toBeDefined();
      expect(result?.length).toBe(2);
    });

    test('should return undefined for empty array', () => {
      const result = mapReferenceRangeArray([]);

      expect(result).toBeUndefined();
    });

    test('should return undefined for undefined input', () => {
      const result = mapReferenceRangeArray(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('mapReferenceRange', () => {
    test('should return undefined for undefined input', () => {
      const result = mapReferenceRange(undefined);

      expect(result).toBeUndefined();
    });

    test('should handle reference range with narrative extension', () => {
      const referenceRange = {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
            valueString: '#ref-range-1',
          },
        ],
      };

      const result = mapReferenceRange(referenceRange);

      expect(result).toBeDefined();
      expect(result?.observationRange?.text?.reference?.['@_value']).toBe('#ref-range-1');
    });

    test('should handle reference range without narrative extension', () => {
      const referenceRange = {
        low: { value: 60, unit: 'bpm' },
        high: { value: 100, unit: 'bpm' },
        extension: [
          {
            url: 'https://example.com/other-extension',
            valueString: 'other',
          },
        ],
      };

      const result = mapReferenceRange(referenceRange);

      expect(result).toBeDefined();
      // createTextFromExtensions returns undefined if no narrative reference extension
      expect(result?.observationRange?.text).toBeUndefined();
    });
  });
});
