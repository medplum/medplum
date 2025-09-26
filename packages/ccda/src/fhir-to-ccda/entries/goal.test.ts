// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { CompositionSection, Goal, Patient } from '@medplum/fhirtypes';
import { OID_GOAL_OBSERVATION, OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION, OID_PROCEDURE_ACTIVITY_ACT } from '../../oids';
import {
  LOINC_GOALS_SECTION,
  LOINC_HISTORY_OF_SOCIAL_FUNCTION,
  LOINC_OVERALL_GOAL,
  LOINC_PLAN_OF_TREATMENT_SECTION,
} from '../../systems';
import { createGoalEntry } from './goal';

describe('createGoalEntry', () => {
  let patient: Patient;

  beforeEach(() => {
    patient = {
      id: 'patient-1',
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    };
  });

  test('should create goal entry with category in goals section', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '273249006',
              display: 'Assessment scales',
            },
          ],
        },
      ],
      description: {
        text: 'Patient will walk 30 minutes daily',
      },
      startDate: '2024-01-01',
      identifier: [{ system: 'http://example.org', value: 'goal-123' }],
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    expect(result?.observation).toBeDefined();
    expect(result?.observation?.length).toBe(1);

    const observation = result?.observation?.[0];
    expect(observation?.['@_classCode']).toBe('OBS');
    expect(observation?.['@_moodCode']).toBe('GOL');
    expect(observation?.templateId).toEqual([{ '@_root': OID_GOAL_OBSERVATION }]);
    expect(observation?.code?.['@_code']).toBe('273249006');
    expect(observation?.code?.['@_displayName']).toBe('Assessment scales');
    expect(observation?.statusCode?.['@_code']).toBe('active');
    expect(observation?.effectiveTime?.[0]?.['@_value']).toBe('20240101');
    // Value structure is dynamic based on goal description
    expect(observation?.value).toBeDefined();
    expect(observation?.id).toBeDefined();
  });

  test('should create goal entry without category in goals section', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Patient will walk 30 minutes daily',
      },
      startDate: '2024-01-01',
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.code?.['@_code']).toBe(LOINC_OVERALL_GOAL);
    expect(observation?.code?.['@_displayName']).toBe("Resident's overall goal established during assessment process");
  });

  test('should create goal entry for plan of treatment section', () => {
    const section: CompositionSection = {
      title: 'Plan of Treatment',
      code: {
        coding: [{ code: LOINC_PLAN_OF_TREATMENT_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'completed',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '273249006',
              display: 'Assessment scales',
            },
          ],
        },
      ],
      description: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '182856006',
            display: 'Drug therapy discontinued',
          },
        ],
      },
      startDate: '2024-01-01T10:00:00Z',
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.templateId).toEqual([{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }]);
    expect(observation?.statusCode?.['@_code']).toBe('completed');
    expect(observation?.effectiveTime?.[0]?.['@_value']).toBe('20240101100000+0000');
    expect(observation?.value).toBeDefined();
  });

  test('should create goal entry for social function', () => {
    const section: CompositionSection = {
      title: 'Social History',
      code: {
        coding: [{ code: 'social-history' }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'cancelled',
      subject: createReference(patient),
      category: [
        {
          coding: [
            {
              system: 'http://loinc.org',
              code: LOINC_HISTORY_OF_SOCIAL_FUNCTION,
              display: 'History of social function Narrative',
            },
          ],
        },
      ],
      description: {
        text: 'Social function goal',
      },
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.templateId).toEqual([
      { '@_root': OID_GOAL_OBSERVATION },
      { '@_root': OID_GOAL_OBSERVATION, '@_extension': '2022-06-01' },
    ]);
    expect(observation?.statusCode?.['@_code']).toBe('cancelled');
  });

  test('should create goal entry with targets', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Weight management goal',
      },
      target: [
        {
          measure: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '29463-7',
                display: 'Body weight',
              },
            ],
          },
          detailQuantity: {
            value: 150,
            unit: 'lbs',
          },
        },
        {
          measure: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '39156-5',
                display: 'Body mass index (BMI)',
              },
            ],
          },
          detailQuantity: {
            value: 25,
            unit: 'kg/m2',
          },
        },
      ],
      startDate: '2024-01-01',
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.entryRelationship).toBeDefined();
    expect(observation?.entryRelationship?.length).toBe(2);

    const firstTarget = observation?.entryRelationship?.[0];
    expect(firstTarget?.['@_typeCode']).toBe('RSON');
    expect(firstTarget?.['@_inversionInd']).toBe('true');
    expect(firstTarget?.act?.[0]?.['@_classCode']).toBe('ACT');
    expect(firstTarget?.act?.[0]?.['@_moodCode']).toBe('EVN');
    expect(firstTarget?.act?.[0]?.templateId).toEqual([
      { '@_root': OID_PROCEDURE_ACTIVITY_ACT },
      { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
    ]);
    expect(firstTarget?.act?.[0]?.code?.['@_code']).toBe('29463-7');
    expect(firstTarget?.act?.[0]?.code?.['@_displayName']).toBe('Body weight');
    expect(firstTarget?.act?.[0]?.statusCode?.['@_code']).toBe('completed');
  });

  test('should return undefined when goal has no category, description coding, or is in wrong section', () => {
    const section: CompositionSection = {
      title: 'Some Other Section',
      code: {
        coding: [{ code: 'other-section' }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Some goal text',
      },
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeUndefined();
  });

  test('should create goal entry with description text in plan of treatment section', () => {
    const section: CompositionSection = {
      title: 'Plan of Treatment',
      code: {
        coding: [{ code: LOINC_PLAN_OF_TREATMENT_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Some goal text without coding',
      },
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.templateId).toEqual([{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }]);
    expect(observation?.code).toBeUndefined(); // No category or description coding
    // Value structure is dynamic based on goal description
    expect(observation?.value).toBeDefined();
  });

  test('should handle goal without startDate', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Patient will walk 30 minutes daily',
      },
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.effectiveTime?.[0]?.['@_value']).toBeUndefined();
  });

  test('should handle goal with extension for text reference', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      id: 'goal-1',
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Goal with narrative reference',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
          valueString: '#goal-narrative',
        },
      ],
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.text?.reference?.['@_value']).toBe('#goal-narrative');
  });

  test('should handle goal without id or identifiers', () => {
    const section: CompositionSection = {
      title: 'Goals',
      code: {
        coding: [{ code: LOINC_GOALS_SECTION }],
      },
    };

    const goal: Goal = {
      resourceType: 'Goal',
      lifecycleStatus: 'active',
      subject: createReference(patient),
      description: {
        text: 'Goal without ID',
      },
    };

    const result = createGoalEntry(section, goal);

    expect(result).toBeDefined();
    const observation = result?.observation?.[0];
    expect(observation?.id).toBeDefined();
  });
});
