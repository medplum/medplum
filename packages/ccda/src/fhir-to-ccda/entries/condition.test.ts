// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import {
  Bundle,
  Composition,
  CompositionSection,
  Condition,
  Observation,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { OID_HEALTH_CONCERN_ACT, OID_PROBLEM_ACT, OID_PROBLEM_OBSERVATION } from '../../oids';
import { LOINC_HEALTH_CONCERNS_SECTION, LOINC_PROBLEMS_SECTION } from '../../systems';
import { FhirToCcdaConverter } from '../convert';
import { createConditionEntry, createHealthConcernEntry, createProblemEntry } from './condition';

describe('Condition Entry Functions', () => {
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

  describe('createConditionEntry', () => {
    test('should return problem entry for problems section', () => {
      const section: CompositionSection = {
        title: 'Problems',
        code: {
          coding: [{ code: LOINC_PROBLEMS_SECTION }],
        },
      };

      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createConditionEntry(converter, section, condition);

      expect(result).toBeDefined();
      expect(result?.act).toBeDefined();
      expect(result?.act?.[0]?.templateId).toContainEqual({ '@_root': OID_PROBLEM_ACT });
    });

    test('should return health concern entry for health concerns section', () => {
      const section: CompositionSection = {
        title: 'Health Concerns',
        code: {
          coding: [{ code: LOINC_HEALTH_CONCERNS_SECTION }],
        },
      };

      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createConditionEntry(converter, section, condition);

      expect(result).toBeDefined();
      expect(result?.act).toBeDefined();
      expect(result?.act?.[0]?.templateId).toContainEqual({
        '@_root': OID_HEALTH_CONCERN_ACT,
        '@_extension': '2015-08-01',
      });
    });

    test('should return undefined for unknown section', () => {
      const section: CompositionSection = {
        title: 'Unknown Section',
        code: {
          coding: [{ code: 'unknown-code' }],
        },
      };

      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
      };

      const result = createConditionEntry(converter, section, condition);

      expect(result).toBeUndefined();
    });
  });

  describe('createProblemEntry', () => {
    test('should create basic problem entry', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createProblemEntry(converter, condition);

      expect(result).toBeDefined();
      expect(result.act).toBeDefined();
      expect(result.act?.length).toBe(1);

      const act = result.act?.[0];
      expect(act?.['@_classCode']).toBe('ACT');
      expect(act?.['@_moodCode']).toBe('EVN');
      expect(act?.code?.['@_code']).toBe('CONC');
      expect(act?.statusCode?.['@_code']).toBe('active'); // Default status
    });

    test('should handle condition with clinical status', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'inactive' }],
        },
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createProblemEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.statusCode?.['@_code']).toBe('inactive');
    });

    test('should handle condition with dates', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        recordedDate: '2024-01-01',
        onsetDateTime: '2023-12-25',
        abatementDateTime: '2024-01-15',
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createProblemEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.effectiveTime?.[0]?.low?.['@_value']).toBe('20240101');

      const observation = act?.entryRelationship?.[0]?.observation?.[0];
      expect(observation?.effectiveTime?.[0]?.low?.['@_value']).toBe('20231225');
      expect(observation?.effectiveTime?.[0]?.high?.['@_value']).toBe('20240115');
    });

    test('should handle condition with identifiers', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        identifier: [{ system: 'http://example.org', value: 'condition-123' }],
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createProblemEntry(converter, condition);

      const observation = result.act?.[0]?.entryRelationship?.[0]?.observation?.[0];
      expect(observation?.id).toBeDefined();
      expect(Array.isArray(observation?.id)).toBe(true);
    });

    test('should handle condition with asserter', () => {
      const practitioner: Practitioner = {
        id: 'practitioner-1',
        resourceType: 'Practitioner',
        name: [{ given: ['Dr.'], family: 'Smith' }],
      };

      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        asserter: createReference(practitioner),
        recordedDate: '2024-01-01',
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      bundle.entry?.push({ resource: practitioner });

      const result = createProblemEntry(converter, condition);

      const observation = result.act?.[0]?.entryRelationship?.[0]?.observation?.[0];
      expect(observation?.author).toBeDefined();
    });
  });

  describe('createHealthConcernEntry', () => {
    test('should create basic health concern entry', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      expect(result).toBeDefined();
      expect(result.act).toBeDefined();
      expect(result.act?.length).toBe(1);

      const act = result.act?.[0];
      expect(act?.['@_classCode']).toBe('ACT');
      expect(act?.['@_moodCode']).toBe('EVN');
      expect(act?.code?.['@_code']).toBe(LOINC_HEALTH_CONCERNS_SECTION);
      expect(act?.code?.['@_displayName']).toBe('Health Concern');
      expect(act?.entryRelationship).toEqual([]);
    });

    test('should handle health concern with clinical status', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'inactive' }],
        },
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.statusCode?.['@_code']).toBe('inactive');
    });

    test('should handle health concern with evidence observations', () => {
      const observation: Observation = {
        id: 'observation-1',
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ system: 'http://loinc.org', code: '33747-0', display: 'General appearance' }],
        },
        subject: createReference(patient),
        effectivePeriod: { start: '2024-01-01', end: '2024-01-02' },
        valueCodeableConcept: {
          coding: [{ system: 'http://snomed.info/sct', code: '17621005', display: 'Normal' }],
        },
        performer: [createReference(patient)],
        effectiveDateTime: '2024-01-01',
        identifier: [{ value: 'obs-123' }],
      };

      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        evidence: [
          {
            detail: [createReference(observation)],
          },
        ],
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      bundle.entry?.push({ resource: observation });

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.entryRelationship).toBeDefined();
      expect(act?.entryRelationship?.length).toBe(1);

      const entryRel = act?.entryRelationship?.[0];
      expect(entryRel?.['@_typeCode']).toBe('REFR');
      expect(entryRel?.observation).toBeDefined();

      const obsEntry = entryRel?.observation?.[0];
      expect(obsEntry?.['@_classCode']).toBe('OBS');
      expect(obsEntry?.['@_moodCode']).toBe('EVN');
      expect(obsEntry?.templateId).toContainEqual({ '@_root': OID_PROBLEM_OBSERVATION });
    });

    test('should skip non-observation evidence details', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        evidence: [
          {
            detail: [createReference(patient)], // Not an observation
          },
        ],
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.entryRelationship).toEqual([]);
    });

    test('should handle missing evidence details', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        evidence: [
          {
            detail: [{ reference: 'Observation/nonexistent' }],
          },
        ],
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.entryRelationship).toEqual([]);
    });

    test('should handle evidence without detail', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        evidence: [{}], // Evidence without detail
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.entryRelationship).toEqual([]);
    });

    test('should handle health concern with recorded date', () => {
      const condition: Condition = {
        id: 'condition-1',
        resourceType: 'Condition',
        subject: createReference(patient),
        recordedDate: '2024-01-01',
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '233604007', display: 'Pneumonia' }],
        },
      };

      const result = createHealthConcernEntry(converter, condition);

      const act = result.act?.[0];
      expect(act?.effectiveTime?.[0]?.low?.['@_value']).toBe('20240101');
    });
  });
});
