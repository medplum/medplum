// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getTypedPropertyValueWithoutSchema, isPopulated, toTypedValue } from '@medplum/core';
import { Observation, ObservationComponent, ObservationReferenceRange } from '@medplum/fhirtypes';
import { mapFhirPeriodOrDateTimeToCcda, mapFhirToCcdaDateTime } from '../../datetime';
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
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
} from '../../systems';
import {
  CcdaCode,
  CcdaEntry,
  CcdaEntryRelationship,
  CcdaId,
  CcdaObservation,
  CcdaOrganizer,
  CcdaOrganizerComponent,
  CcdaReferenceRange,
  CcdaTemplateId,
  CcdaValue,
} from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, getNarrativeReference, mapIdentifiers } from '../utils';

export function createObservationEntry(converter: FhirToCcdaConverter, observation: Observation): CcdaEntry {
  const obsValue = getTypedPropertyValueWithoutSchema(toTypedValue(observation), 'value');
  if ((observation.component || observation.hasMember) && !isPopulated(obsValue)) {
    // Organizer
    return {
      organizer: [createVitalSignsOrganizer(converter, observation)],
    };
  } else {
    // Direct observation
    return {
      observation: [createCcdaObservation(converter, observation)],
    };
  }
}

export function createVitalSignsOrganizer(converter: FhirToCcdaConverter, observation: Observation): CcdaOrganizer {
  const components: CcdaOrganizerComponent[] = [];

  if (observation.component) {
    for (const component of observation.component) {
      components.push({
        observation: [createCcdaObservation(converter, observation, component)],
      });
    }
  }

  if (observation.hasMember) {
    for (const member of observation.hasMember) {
      const child = converter.findResourceByReference(member);
      if (!child || child.resourceType !== 'Observation') {
        continue;
      }

      if (child.component) {
        for (const component of child.component) {
          components.push({
            observation: [createCcdaObservation(converter, child as Observation, component)],
          });
        }
      } else {
        components.push({
          observation: [createCcdaObservation(converter, child as Observation)],
        });
      }
    }
  }

  const result: CcdaOrganizer = {
    '@_classCode': 'CLUSTER',
    '@_moodCode': 'EVN',
    templateId: mapOrganizerTemplateId(observation),
    id: mapIdentifiers(observation.id, observation.identifier) as CcdaId[],
    code: mapCodeableConceptToCcdaCode(observation.code) as CcdaCode,
    statusCode: { '@_code': 'completed' },
    effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(observation.effectiveDateTime) }],
    component: components,
  };

  return result;
}

export function createCcdaObservation(
  converter: FhirToCcdaConverter,
  observation: Observation,
  component?: ObservationComponent
): CcdaObservation {
  let code: CcdaCode | undefined = mapCodeableConceptToCcdaCode(component?.code ?? observation.code);
  if (code?.['@_code'] === LOINC_PREGNANCY_STATUS) {
    // This is a ridiculous special case.
    // USCDI v3 requires that the pregnancy status observation use:
    code = {
      '@_code': 'ASSERTION',
      '@_codeSystem': '2.16.840.1.113883.5.4',
    };
  }

  const entryRelationship: CcdaEntryRelationship[] = [];

  if (observation.hasMember) {
    for (const member of observation.hasMember) {
      const child = converter.findResourceByReference(member);
      if (!child || child.resourceType !== 'Observation') {
        continue;
      }

      entryRelationship.push({
        '@_typeCode': 'COMP',
        observation: [createCcdaObservation(converter, child as Observation)],
      });
    }
  }

  const result: CcdaObservation = {
    '@_classCode': 'OBS',
    '@_moodCode': 'EVN',
    templateId: mapObservationTemplateId(observation, component),
    id: mapIdentifiers(observation.id, observation.identifier) as CcdaId[],
    code,
    statusCode: { '@_code': 'completed' },
    effectiveTime: [mapFhirPeriodOrDateTimeToCcda(observation.effectivePeriod, observation.effectiveDateTime)],
    value: mapObservationValue(component ?? observation),
    referenceRange: mapReferenceRangeArray(component?.referenceRange ?? observation.referenceRange),
    text: createTextFromExtensions(component?.extension ?? observation.extension),
    author: converter.mapAuthor(observation.performer?.[0], observation.effectiveDateTime),
    entryRelationship,
  };

  return result;
}

export function mapOrganizerTemplateId(observation: Observation): CcdaTemplateId[] {
  if (observation.code?.coding?.[0]?.code === 'd5') {
    // ICF functional status organizer
    return [
      { '@_root': OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER, '@_extension': '2014-06-09' },
      { '@_root': OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER },
    ];
  }

  // Default to vital signs organizer
  return [
    { '@_root': OID_VITAL_SIGNS_ORGANIZER },
    { '@_root': OID_VITAL_SIGNS_ORGANIZER, '@_extension': '2015-08-01' },
  ];
}

export function mapObservationTemplateId(observation: Observation, component?: ObservationComponent): CcdaTemplateId[] {
  const code = observation.code?.coding?.[0]?.code;
  const category = observation.category?.[0]?.coding?.[0]?.code;

  if (code === LOINC_TOBACCO_SMOKING_STATUS) {
    return [
      { '@_root': OID_SMOKING_STATUS_OBSERVATION },
      { '@_root': OID_SMOKING_STATUS_OBSERVATION, '@_extension': '2014-06-09' },
    ];
  }

  if (code === LOINC_HISTORY_OF_TOBACCO_USE) {
    return [
      { '@_root': OID_TOBACCO_USE_OBSERVATION },
      { '@_root': OID_TOBACCO_USE_OBSERVATION, '@_extension': '2014-06-09' },
    ];
  }

  if (code === LOINC_ADMINISTRATIVE_SEX) {
    return [{ '@_root': OID_SEX_OBSERVATION, '@_extension': '2023-06-28' }];
  }

  if (code === LOINC_BIRTH_SEX) {
    return [{ '@_root': OID_BIRTH_SEX }, { '@_root': OID_BIRTH_SEX, '@_extension': '2016-06-01' }];
  }

  if (code === LOINC_DISABILITY_STATUS) {
    return [
      { '@_root': OID_DISABILITY_STATUS_OBSERVATION },
      { '@_root': OID_DISABILITY_STATUS_OBSERVATION, '@_extension': '2023-05-01' },
    ];
  }

  if (code === LOINC_HISTORY_OF_OCCUPATION) {
    return [{ '@_root': OID_BASIC_OCCUPATION_OBSERVATION, '@_extension': '2023-05-01' }];
  }

  if (code === LOINC_HISTORY_OF_OCCUPATION_INDUSTRY) {
    return [{ '@_root': OID_BASIC_INDUSTRY_OBSERVATION, '@_extension': '2023-05-01' }];
  }

  if (code === LOINC_PREGNANCY_STATUS) {
    return [{ '@_root': OID_PREGNANCY_OBSERVATION }];
  }

  if (code === LOINC_TRIBAL_AFFILIATION) {
    return [{ '@_root': OID_TRIBAL_AFFILIATION_OBSERVATION, '@_extension': '2023-05-01' }];
  }

  if (code === 'd5') {
    const componentCode = component?.code?.coding?.[0]?.code;
    if (componentCode === LOINC_FUNCTIONAL_STATUS_ASSESSMENT_NOTE) {
      return [{ '@_root': OID_SELF_CARE_ACTIVITIES_ADL_AND_IADL }];
    }

    return [
      { '@_root': OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION, '@_extension': '2014-06-09' },
      { '@_root': OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION },
    ];
  }

  if (category === 'exam') {
    return [
      { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION },
      { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION, '@_extension': '2014-06-09' },
    ];
  }

  if (category === 'laboratory') {
    return [{ '@_root': OID_RESULT_OBSERVATION }, { '@_root': OID_RESULT_OBSERVATION, '@_extension': '2015-08-01' }];
  }

  if (category === 'survey') {
    if (observation.hasMember) {
      return [{ '@_root': OID_ASSESSMENT_SCALE_OBSERVATION, '@_extension': '2022-06-01' }];
    }
    return [{ '@_root': OID_ASSESSMENT_SCALE_SUPPORTING_OBSERVATION }];
  }

  // Otherwise, fall back to the default template ID.
  return [
    { '@_root': OID_VITAL_SIGNS_OBSERVATION },
    { '@_root': OID_VITAL_SIGNS_OBSERVATION, '@_extension': '2014-06-09' },
  ];
}

export function mapObservationValue(observation: Observation | ObservationComponent): CcdaValue | undefined {
  if (observation.valueQuantity) {
    return {
      '@_xsi:type': 'PQ',
      '@_unit': observation.valueQuantity.unit,
      '@_value': observation.valueQuantity.value?.toString(),
    };
  }

  if (observation.valueCodeableConcept) {
    return mapCodeableConceptToCcdaValue(observation.valueCodeableConcept);
  }

  if (observation.valueString !== undefined) {
    return { '@_xsi:type': 'ST', '#text': observation.valueString };
  }

  if (observation.valueInteger !== undefined) {
    return { '@_xsi:type': 'INT', '@_value': observation.valueInteger.toString() };
  }

  return undefined;
}

export function mapReferenceRangeArray(
  referenceRange: ObservationReferenceRange[] | undefined
): CcdaReferenceRange[] | undefined {
  if (!referenceRange || referenceRange.length === 0) {
    return undefined;
  }

  return referenceRange.map((range) => mapReferenceRange(range)).filter(Boolean) as CcdaReferenceRange[];
}

export function mapReferenceRange(
  referenceRange: ObservationReferenceRange | undefined
): CcdaReferenceRange | undefined {
  if (!referenceRange) {
    return undefined;
  }

  const narrativeReference = getNarrativeReference(referenceRange.extension);
  if (narrativeReference) {
    // Special case for reference ranges that are a narrative reference
    return {
      observationRange: {
        text: { reference: narrativeReference },
        value: { '@_xsi:type': 'ED', reference: narrativeReference },
      },
    };
  }

  return {
    observationRange: {
      text: createTextFromExtensions(referenceRange.extension),
    },
  };
}
