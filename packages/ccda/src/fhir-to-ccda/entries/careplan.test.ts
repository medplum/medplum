// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Bundle, CarePlan, Composition, Patient } from '@medplum/fhirtypes';
import { OID_INSTRUCTIONS } from '../../oids';
import { FhirToCcdaConverter } from '../convert';
import { createPlanOfTreatmentCarePlanEntry } from './careplan';

describe('createPlanOfTreatmentCarePlanEntry', () => {
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

  test('should return entry for completed care plan', () => {
    const carePlan: CarePlan = {
      id: 'careplan-1',
      resourceType: 'CarePlan',
      status: 'completed',
      intent: 'plan',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '182836005',
              display: 'Review of care plan',
            },
          ],
        },
      ],
      description: 'Follow-up care plan for patient recovery',
      identifier: [{ system: 'http://example.org', value: 'careplan-123' }],
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeDefined();
    expect(result?.act).toBeDefined();
    expect(result?.act?.length).toBe(1);

    const act = result?.act?.[0];
    expect(act?.['@_classCode']).toBe('ACT');
    expect(act?.['@_moodCode']).toBe('INT');
    expect(act?.templateId).toEqual([{ '@_root': OID_INSTRUCTIONS }]);
    expect(act?.statusCode?.['@_code']).toBe('completed');
    expect(act?.text?.['#text']).toBe('Follow-up care plan for patient recovery');
    expect(act?.code?.['@_code']).toBe('182836005');
    expect(act?.code?.['@_displayName']).toBe('Review of care plan');
    expect(act?.id).toBeDefined();
  });

  test('should return entry for completed care plan without description', () => {
    const carePlan: CarePlan = {
      id: 'careplan-1',
      resourceType: 'CarePlan',
      status: 'completed',
      intent: 'plan',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '182836005',
              display: 'Review of care plan',
            },
          ],
        },
      ],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
          valueString: '#care-plan-text',
        },
      ],
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeDefined();
    const act = result?.act?.[0];
    expect(act?.text?.reference?.['@_value']).toBe('#care-plan-text');
  });

  test('should return entry for completed care plan without category', () => {
    const carePlan: CarePlan = {
      id: 'careplan-1',
      resourceType: 'CarePlan',
      status: 'completed',
      intent: 'plan',
      subject: createReference(patient),
      description: 'Simple care plan',
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeDefined();
    const act = result?.act?.[0];
    expect(act?.code).toBeUndefined();
    expect(act?.text?.['#text']).toBe('Simple care plan');
  });

  test('should return undefined for non-completed care plan', () => {
    const carePlan: CarePlan = {
      id: 'careplan-1',
      resourceType: 'CarePlan',
      status: 'active',
      intent: 'plan',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '182836005',
              display: 'Review of care plan',
            },
          ],
        },
      ],
      description: 'Active care plan',
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeUndefined();
  });

  test('should return undefined for draft care plan', () => {
    const carePlan: CarePlan = {
      id: 'careplan-1',
      resourceType: 'CarePlan',
      status: 'draft',
      intent: 'plan',
      subject: createReference(patient),
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeUndefined();
  });

  test('should handle care plan without id or identifiers', () => {
    const carePlan: CarePlan = {
      resourceType: 'CarePlan',
      status: 'completed',
      intent: 'plan',
      subject: createReference(patient),
      description: 'Care plan without ID',
    };

    const result = createPlanOfTreatmentCarePlanEntry(converter, carePlan);

    expect(result).toBeDefined();
    const act = result?.act?.[0];
    expect(act?.id).toBeDefined();
  });
});
