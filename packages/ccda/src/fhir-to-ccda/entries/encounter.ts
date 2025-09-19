// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Encounter, EncounterDiagnosis } from '@medplum/fhirtypes';
import {
  OID_ENCOUNTER_ACTIVITIES,
  OID_ENCOUNTER_LOCATION,
  OID_LOINC_CODE_SYSTEM,
  OID_PROBLEM_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
} from '../../oids';
import { mapCodeableConceptToCcdaCode, mapCodeableConceptToCcdaValue } from '../../systems';
import { CcdaEntry, CcdaEntryRelationship, CcdaId } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapEffectivePeriod, mapEffectiveTime, mapIdentifiers } from '../utils';

export function createEncounterEntry(converter: FhirToCcdaConverter, encounter: Encounter): CcdaEntry {
  return {
    encounter: [
      {
        '@_classCode': 'ENC',
        '@_moodCode': 'EVN',
        templateId: [
          {
            '@_root': OID_ENCOUNTER_ACTIVITIES,
          },
          {
            '@_root': OID_ENCOUNTER_ACTIVITIES,
            '@_extension': '2015-08-01',
          },
        ],
        id: mapIdentifiers(encounter.id, encounter.identifier),
        code: mapCodeableConceptToCcdaCode(encounter.type?.[0]),
        text: createTextFromExtensions(encounter.extension),
        effectiveTime: mapEffectiveTime(undefined, encounter.period),
        participant: encounter.participant?.map((participant) => ({
          '@_typeCode': 'LOC',
          participantRole: {
            '@_classCode': 'SDLOC',
            templateId: [
              {
                '@_root': OID_ENCOUNTER_LOCATION,
              },
            ],
            code: mapCodeableConceptToCcdaCode(participant.type?.[0]),
          },
        })),
        entryRelationship: encounter.diagnosis?.map((d) => createEncounterDiagnosis(converter, d)).filter(Boolean) as
          | CcdaEntryRelationship[]
          | undefined,
      },
    ],
  };
}

function createEncounterDiagnosis(
  converter: FhirToCcdaConverter,
  diagnosis: EncounterDiagnosis
): CcdaEntryRelationship | undefined {
  const condition = converter.findResourceByReference(diagnosis.condition);
  if (!condition || condition.resourceType !== 'Condition') {
    return undefined;
  }
  return {
    '@_typeCode': 'REFR',
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
          { '@_root': OID_ENCOUNTER_ACTIVITIES },
        ],
        code: {
          '@_code': '29308-4', // Diagnosis
          '@_displayName': 'Diagnosis',
          '@_codeSystem': OID_LOINC_CODE_SYSTEM,
          '@_codeSystemName': 'LOINC',
        },
        entryRelationship: [
          {
            '@_typeCode': 'SUBJ',
            observation: [
              {
                '@_classCode': 'OBS',
                '@_moodCode': 'EVN',
                templateId: [
                  { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
                  { '@_root': OID_PROBLEM_OBSERVATION },
                ],
                id: mapIdentifiers(condition.id, condition.identifier) as CcdaId[],
                code: {
                  '@_code': '282291009', // Diagnosis interpretation
                  '@_displayName': 'Diagnosis interpretation',
                  '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                  '@_codeSystemName': 'SNOMED CT',
                  translation: [
                    {
                      '@_code': '29308-4', // Diagnosis
                      '@_displayName': 'Diagnosis',
                      '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                      '@_codeSystemName': 'LOINC',
                    },
                  ],
                },
                statusCode: { '@_code': 'completed' },
                effectiveTime: mapEffectivePeriod(condition.onsetDateTime, condition.abatementDateTime),
                value: mapCodeableConceptToCcdaValue(condition.code),
              },
            ],
          },
        ],
      },
    ],
  };
}
