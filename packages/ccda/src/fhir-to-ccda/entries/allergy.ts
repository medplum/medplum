// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { capitalize } from '@medplum/core';
import { AllergyIntolerance } from '@medplum/fhirtypes';
import {
  OID_ACT_CLASS_CODE_SYSTEM,
  OID_ACT_CODE_CODE_SYSTEM,
  OID_ALLERGY_OBSERVATION,
  OID_ALLERGY_PROBLEM_ACT,
  OID_REACTION_OBSERVATION,
  OID_SEVERITY_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
} from '../../oids';
import {
  ALLERGY_CATEGORY_MAPPER,
  ALLERGY_SEVERITY_MAPPER,
  ALLERGY_STATUS_MAPPER,
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
} from '../../systems';
import { CcdaEntry, CcdaValue } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import {
  createTextFromExtensions,
  getNarrativeReference,
  mapEffectiveDate,
  mapEffectivePeriod,
  mapIdentifiers,
} from '../utils';

/**
 * Create the C-CDA allergy entry for the FHIR allergy.
 * @param converter - The FHIR to C-CDA converter.
 * @param allergy - The FHIR allergy to create the C-CDA allergy entry for.
 * @returns The C-CDA allergy entry.
 */
export function createAllergyEntry(converter: FhirToCcdaConverter, allergy: AllergyIntolerance): CcdaEntry {
  const reaction = allergy.reaction?.[0];
  return {
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [
          {
            '@_root': OID_ALLERGY_PROBLEM_ACT,
          },
          {
            '@_root': OID_ALLERGY_PROBLEM_ACT,
            '@_extension': '2015-08-01',
          },
        ],
        id: mapIdentifiers(allergy.id, allergy.identifier),
        code: {
          '@_code': 'CONC',
          '@_codeSystem': OID_ACT_CLASS_CODE_SYSTEM,
        },
        statusCode: {
          '@_code': ALLERGY_STATUS_MAPPER.mapFhirToCcdaWithDefault(allergy.clinicalStatus?.coding?.[0]?.code, 'active'),
        },
        effectiveTime: mapEffectivePeriod(allergy.recordedDate, undefined),
        author: converter.mapAuthor(allergy.recorder, allergy.recordedDate),
        text: createTextFromExtensions(allergy.extension),
        entryRelationship: [
          {
            '@_typeCode': 'SUBJ',
            observation: [
              {
                '@_classCode': 'OBS',
                '@_moodCode': 'EVN',
                templateId: [
                  {
                    '@_root': OID_ALLERGY_OBSERVATION,
                  },
                  {
                    '@_root': OID_ALLERGY_OBSERVATION,
                    '@_extension': '2014-06-09',
                  },
                ],
                id: mapIdentifiers(allergy.id, allergy.identifier),
                code: {
                  '@_code': 'ASSERTION',
                  '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                },
                text: createTextFromExtensions(allergy.extension),
                statusCode: {
                  '@_code': 'completed',
                },
                effectiveTime: mapEffectivePeriod(
                  allergy.onsetPeriod?.start ?? allergy.onsetDateTime,
                  allergy.onsetPeriod?.end,
                  true
                ),
                value: mapAllergyCategory(allergy.category),
                author: converter.mapAuthor(allergy.asserter, allergy.recordedDate),
                participant: [
                  {
                    '@_typeCode': 'CSM',
                    participantRole: {
                      '@_classCode': 'MANU',
                      playingEntity: {
                        '@_classCode': 'MMAT',
                        code:
                          // Handle special case for "No known allergies"
                          // https://hl7.org/fhir/R4/allergyintolerance-nka.json.html
                          // C-CDA-Examples/Allergies/No Known Allergies
                          allergy.code?.coding?.[0]?.code === '716186003'
                            ? { '@_nullFlavor': 'NA' }
                            : {
                                ...mapCodeableConceptToCcdaCode(allergy.code),
                                originalText: allergy.code?.extension
                                  ? {
                                      reference: getNarrativeReference(allergy.code?.extension),
                                    }
                                  : undefined,
                              },
                      },
                    },
                  },
                ],
                entryRelationship: reaction
                  ? [
                      {
                        '@_typeCode': 'MFST',
                        '@_inversionInd': 'true',
                        observation: [
                          {
                            '@_classCode': 'OBS',
                            '@_moodCode': 'EVN',
                            templateId: [
                              {
                                '@_root': OID_REACTION_OBSERVATION,
                              },
                              {
                                '@_root': OID_REACTION_OBSERVATION,
                                '@_extension': '2014-06-09',
                              },
                            ],
                            id: mapIdentifiers(reaction.id, undefined),
                            code: {
                              '@_code': 'ASSERTION',
                              '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                            },
                            statusCode: {
                              '@_code': 'completed',
                            },
                            effectiveTime: mapEffectiveDate(allergy.onsetDateTime, allergy.onsetPeriod),
                            value: mapCodeableConceptToCcdaValue(reaction.manifestation?.[0]),
                            text: createTextFromExtensions(reaction.manifestation?.[0]?.extension),
                            entryRelationship: [
                              {
                                '@_typeCode': 'SUBJ',
                                '@_inversionInd': 'true',
                                observation: [
                                  {
                                    '@_classCode': 'OBS',
                                    '@_moodCode': 'EVN',
                                    templateId: [
                                      {
                                        '@_root': OID_SEVERITY_OBSERVATION,
                                      },
                                      {
                                        '@_root': OID_SEVERITY_OBSERVATION,
                                        '@_extension': '2014-06-09',
                                      },
                                    ],
                                    code: {
                                      '@_code': 'SEV',
                                      '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                                      '@_codeSystemName': 'ActCode',
                                    },
                                    statusCode: {
                                      '@_code': 'completed',
                                    },
                                    value: {
                                      '@_xsi:type': 'CD',
                                      '@_code': ALLERGY_SEVERITY_MAPPER.mapFhirToCcdaWithDefault(
                                        reaction.severity,
                                        'M'
                                      ),
                                      '@_displayName': reaction.severity ? capitalize(reaction.severity) : undefined,
                                      '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                                      '@_codeSystemName': 'SNOMED CT',
                                    },
                                    text: createTextFromExtensions(reaction.extension),
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ]
                  : [],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Map the FHIR allergy category to the C-CDA allergy category.
 * @param category - The category to map.
 * @returns The C-CDA allergy category.
 */
export function mapAllergyCategory(category: AllergyIntolerance['category']): CcdaValue {
  // Default to generic allergy if no category is provided
  const code = ALLERGY_CATEGORY_MAPPER.mapFhirToCcdaCode(category?.[0]) ?? {
    '@_code': '419199007',
    '@_displayName': 'Allergy to substance (disorder)',
    '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
    '@_codeSystemName': 'SNOMED CT',
  };
  return { '@_xsi:type': 'CD', ...code };
}
