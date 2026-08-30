// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { EMPTY, generateId } from '@medplum/core';
import type { CompositionSection, Condition } from '@medplum/fhirtypes';
import { mapFhirToCcdaDate, mapFhirToCcdaDateTime } from '../../datetime';
import {
  OID_ACT_CLASS_CODE_SYSTEM,
  OID_HEALTH_CONCERN_ACT,
  OID_LOINC_CODE_SYSTEM,
  OID_PROBLEM_ACT,
  OID_PROBLEM_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
} from '../../oids';
import {
  LOINC_CLINICAL_FINDING,
  LOINC_CONDITION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_PROBLEMS_SECTION,
  mapCodeableConceptToCcdaValue,
} from '../../systems';
import type { CcdaEntry, CcdaEntryRelationship } from '../../types';
import type { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapEffectivePeriod, mapIdentifiers } from '../utils';

/**
 * Maps a FHIR `Condition.clinicalStatus` to a C-CDA concern act `statusCode`.
 *
 * The concern act statusCode (ProblemAct value set 2.16.840.1.113883.11.20.9.19) tracks the
 * concern, not the clinical course. A no-longer-active condition is a closed concern, whose
 * normal terminal state is "completed" — "suspended"/"aborted" are workflow interruptions and
 * are not implied by any FHIR condition-clinical code. Must stay symmetric with the import
 * direction, which maps "completed" to "resolved" when an effectiveTime high is asserted and
 * "inactive" otherwise.
 *
 * @param condition - The FHIR Condition.
 * @returns The C-CDA concern act statusCode value.
 */
function mapClinicalStatusToConcernActStatus(condition: Condition): 'active' | 'completed' {
  switch (condition.clinicalStatus?.coding?.[0]?.code) {
    case 'inactive':
    case 'resolved':
      return 'completed';
    default:
      return 'active';
  }
}

/**
 * Returns true if the FHIR Condition is refuted (ruled out).
 *
 * @param condition - The FHIR Condition.
 * @returns True if `Condition.verificationStatus` contains the "refuted" code.
 */
function isConditionRefuted(condition: Condition): boolean {
  return !!condition.verificationStatus?.coding?.some((coding) => coding.code === 'refuted');
}

export function createConditionEntry(
  converter: FhirToCcdaConverter,
  section: CompositionSection,
  condition: Condition
): CcdaEntry | undefined {
  const sectionCode = section.code?.coding?.[0]?.code;
  if (sectionCode === LOINC_PROBLEMS_SECTION) {
    return createProblemEntry(converter, condition);
  }
  if (sectionCode === LOINC_HEALTH_CONCERNS_SECTION) {
    return createHealthConcernEntry(converter, condition);
  }
  return undefined;
}

export function createProblemEntry(converter: FhirToCcdaConverter, problem: Condition): CcdaEntry {
  const concernStatus = mapClinicalStatusToConcernActStatus(problem);
  return {
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [{ '@_root': OID_PROBLEM_ACT }, { '@_root': OID_PROBLEM_ACT, '@_extension': '2015-08-01' }],
        id: mapIdentifiers(problem.id, undefined),
        code: {
          '@_code': 'CONC',
          '@_codeSystem': OID_ACT_CLASS_CODE_SYSTEM,
        },
        statusCode: {
          '@_code': concernStatus,
        },
        // A closed concern carries its end date, so that the import direction
        // ("completed" + effectiveTime high => resolved) can round-trip it.
        effectiveTime: mapEffectivePeriod(
          problem.recordedDate,
          concernStatus === 'completed' ? problem.abatementDateTime : undefined
        ),
        entryRelationship: [
          {
            '@_typeCode': 'SUBJ',
            observation: [
              {
                '@_classCode': 'OBS',
                '@_moodCode': 'EVN',
                '@_negationInd': isConditionRefuted(problem) ? 'true' : undefined,
                templateId: [
                  { '@_root': OID_PROBLEM_OBSERVATION },
                  { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
                ],
                id: problem.identifier
                  ? mapIdentifiers(undefined, problem.identifier)
                  : [
                      {
                        '@_root': generateId(),
                      },
                    ],
                text: createTextFromExtensions(problem.extension),
                code: {
                  '@_code': '55607006',
                  '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                  '@_codeSystemName': 'SNOMED CT',
                  '@_displayName': 'Problem',
                  translation: [
                    {
                      '@_code': LOINC_CONDITION,
                      '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                      '@_codeSystemName': 'LOINC',
                      '@_displayName': 'Condition',
                    },
                  ],
                },
                statusCode: { '@_code': 'completed' },
                effectiveTime: [
                  {
                    low: problem.onsetDateTime ? { '@_value': mapFhirToCcdaDate(problem.onsetDateTime) } : undefined,
                    high: problem.abatementDateTime
                      ? { '@_value': mapFhirToCcdaDateTime(problem.abatementDateTime) }
                      : undefined,
                  },
                ],
                value: mapCodeableConceptToCcdaValue(problem.code),
                author: converter.mapAuthor(problem.asserter, problem.recordedDate),
              },
            ],
          },
        ],
      },
    ],
  };
}

export function createHealthConcernEntry(converter: FhirToCcdaConverter, healthConcern: Condition): CcdaEntry {
  const entryRelationship: CcdaEntryRelationship[] = [];

  for (const evidence of healthConcern.evidence ?? EMPTY) {
    for (const detailRef of evidence.detail ?? EMPTY) {
      const detail = converter.findResourceByReference(detailRef);
      if (detail?.resourceType === 'Observation') {
        entryRelationship.push({
          '@_typeCode': 'REFR',
          observation: [
            {
              '@_classCode': 'OBS',
              '@_moodCode': 'EVN',
              templateId: [
                { '@_root': OID_PROBLEM_OBSERVATION },
                { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
              ],
              id: mapIdentifiers(detail.id, detail.identifier),
              text: createTextFromExtensions(detail.extension),
              code: {
                '@_code': '404684003',
                '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                '@_codeSystemName': 'SNOMED CT',
                '@_displayName': 'Clinical finding (finding)',
                translation: [
                  {
                    '@_code': LOINC_CLINICAL_FINDING,
                    '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                    '@_codeSystemName': 'LOINC',
                    '@_displayName': 'Clinical finding',
                  },
                ],
              },
              statusCode: { '@_code': 'completed' },
              effectiveTime: mapEffectivePeriod(detail.effectivePeriod?.start, detail.effectivePeriod?.end, true),
              value: mapCodeableConceptToCcdaValue(detail.valueCodeableConcept),
              author: converter.mapAuthor(detail.performer?.[0], detail.effectiveDateTime),
            },
          ],
        });
      }
    }
  }

  return {
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_HEALTH_CONCERN_ACT, '@_extension': '2015-08-01' },
          { '@_root': OID_HEALTH_CONCERN_ACT, '@_extension': '2022-06-01' },
        ],
        id: mapIdentifiers(healthConcern.id, undefined),
        code: {
          '@_code': LOINC_HEALTH_CONCERNS_SECTION,
          '@_codeSystem': OID_LOINC_CODE_SYSTEM,
          '@_codeSystemName': 'LOINC',
          '@_displayName': 'Health Concern',
        },
        statusCode: {
          '@_code': mapClinicalStatusToConcernActStatus(healthConcern),
        },
        effectiveTime: mapEffectivePeriod(healthConcern.recordedDate, undefined),
        entryRelationship,
      },
    ],
  };
}
