// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CompositionSection, Goal } from '@medplum/fhirtypes';
import { mapFhirToCcdaDateTime } from '../../datetime';
import {
  OID_GOAL_OBSERVATION,
  OID_LOINC_CODE_SYSTEM,
  OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_ACT,
} from '../../oids';
import {
  LOINC_GOALS_SECTION,
  LOINC_HISTORY_OF_SOCIAL_FUNCTION,
  LOINC_OVERALL_GOAL,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
} from '../../systems';
import { CcdaCode, CcdaEntry, CcdaTemplateId, CcdaValue } from '../../types';
import { createTextFromExtensions, mapIdentifiers } from '../utils';

export function createGoalEntry(section: CompositionSection, resource: Goal): CcdaEntry | undefined {
  const sectionCode = section.code?.coding?.[0]?.code;

  let code: CcdaCode | undefined;
  if (resource.category?.[0]) {
    code = mapCodeableConceptToCcdaCode(resource.category[0]);
  } else if (sectionCode === LOINC_GOALS_SECTION) {
    code = {
      '@_code': LOINC_OVERALL_GOAL,
      '@_codeSystem': OID_LOINC_CODE_SYSTEM,
      '@_codeSystemName': 'LOINC',
      '@_displayName': "Resident's overall goal established during assessment process",
    };
  } else if (resource.description) {
    code = mapCodeableConceptToCcdaCode(resource.description);
  } else {
    return undefined;
  }

  let templateId: CcdaTemplateId[];
  if (sectionCode === LOINC_PLAN_OF_TREATMENT_SECTION) {
    templateId = [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }];
  } else if (code?.['@_code'] === LOINC_HISTORY_OF_SOCIAL_FUNCTION) {
    templateId = [{ '@_root': OID_GOAL_OBSERVATION }, { '@_root': OID_GOAL_OBSERVATION, '@_extension': '2022-06-01' }];
  } else if (sectionCode === LOINC_GOALS_SECTION) {
    templateId = [{ '@_root': OID_GOAL_OBSERVATION }];
  } else {
    return undefined;
  }

  let value: CcdaValue | undefined;
  if (resource.description.coding?.[0]?.code) {
    value = mapCodeableConceptToCcdaValue(resource.description);
  } else if (resource.description.text) {
    value = { '@_xsi:type': 'ST', '#text': resource.description.text };
  }

  return {
    observation: [
      {
        '@_classCode': 'OBS',
        '@_moodCode': 'GOL',
        templateId,
        id: mapIdentifiers(resource.id, resource.identifier),
        code,
        statusCode: { '@_code': mapGoalStatus(resource.lifecycleStatus) },
        effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.startDate) }],
        value,
        text: createTextFromExtensions(resource.extension),
        entryRelationship: resource.target?.map((target) => ({
          '@_typeCode': 'RSON',
          '@_inversionInd': 'true',
          act: [
            {
              '@_classCode': 'ACT',
              '@_moodCode': 'EVN',
              templateId: [
                { '@_root': OID_PROCEDURE_ACTIVITY_ACT },
                { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
              ],
              code: mapCodeableConceptToCcdaCode(target.measure) as CcdaCode,
              statusCode: { '@_code': 'completed' },
              effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.startDate) }],
            },
          ],
        })),
      },
    ],
  };
}

function mapGoalStatus(status: Goal['lifecycleStatus'] | undefined): string {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'active';
  }
}
