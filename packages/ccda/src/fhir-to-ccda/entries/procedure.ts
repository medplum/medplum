// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Location, Observation, Procedure, Reference } from '@medplum/fhirtypes';
import { OID_ENCOUNTER_LOCATION, OID_PROCEDURE_ACTIVITY_ACT, OID_PROCEDURE_ACTIVITY_PROCEDURE } from '../../oids';
import { mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaCode, CcdaEntry, CcdaId, CcdaParticipant } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import {
  createTextFromExtensions,
  mapEffectiveTime,
  mapFhirAddressArrayToCcdaAddressArray,
  mapIdentifiers,
  mapTelecom,
} from '../utils';
import { mapObservationTemplateId, mapObservationValue } from './observation';

export function createHistoryOfProceduresEntry(
  converter: FhirToCcdaConverter,
  resource: Procedure | Observation
): CcdaEntry | undefined {
  if (resource.resourceType === 'Procedure') {
    // A <procedure> in C-CDA typically represents a direct intervention, like a surgery, that changes a patient's physical state.
    // In contrast, an <act> is a broader category encompassing actions that don't necessarily alter the physical state, such as counseling, education, or referrals.
    // The key distinction lies in whether the action primarily focuses on a physical change in the patient or a broader interaction or process.
    const actCodes = [
      // Counseling and Education:
      '183948003', // Patient education (procedure)
      '409063005', // Counseling (procedure)
      '311331002', // Patient counseling (procedure)
      '61310001', // Nutrition education (procedure)
      // Care Management:
      '183945009', // Referral to specialist (procedure)
      '309814009', // Discharge planning (procedure)
      '278373008', // Home visit (procedure)
      // Social Services:
      '410606002', // Social service procedure (procedure)
      '183933003', // Social work assessment (procedure)
      // Other:
      '24642003', // Psychiatry procedure or service (procedure)
      '225338006', // Physiotherapy procedure (procedure)
      '128939004', // First aid (procedure)
    ];
    const procedureCode = resource.code?.coding?.[0]?.code;
    if (procedureCode && actCodes.includes(procedureCode)) {
      // Create an <act> entry
      return {
        act: [
          {
            '@_classCode': 'ACT',
            '@_moodCode': 'EVN',
            templateId: [
              { '@_root': OID_PROCEDURE_ACTIVITY_ACT },
              { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
            ],
            id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            statusCode: { '@_code': 'completed' },
            effectiveTime: mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
            text: createTextFromExtensions(resource.extension),
          },
        ],
      };
    }
    return {
      procedure: [
        {
          '@_classCode': 'PROC',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE },
            { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
          ],
          id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
          code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
          statusCode: { '@_code': 'completed' },
          effectiveTime: mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
          text: createTextFromExtensions(resource.extension),
          targetSiteCode: mapCodeableConceptToCcdaCode(resource.bodySite?.[0]) as CcdaCode,
          participant: [mapLocationToParticipant(converter, resource.location)].filter(Boolean) as CcdaParticipant[],
        },
      ],
    };
  }
  if (resource.resourceType === 'Observation') {
    // Create an <observation> entry
    return {
      observation: [
        {
          '@_classCode': 'OBS',
          '@_moodCode': 'EVN',
          templateId: mapObservationTemplateId(resource),
          id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
          code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
          value: mapObservationValue(resource),
          statusCode: { '@_code': 'completed' },
          effectiveTime: mapEffectiveTime(resource.effectiveDateTime, resource.effectivePeriod),
          text: createTextFromExtensions(resource.extension),
        },
      ],
    };
  }
  throw new Error(`Unknown history of procedures resource type: ${(resource as any).resourceType}`);
}

function mapLocationToParticipant(
  converter: FhirToCcdaConverter,
  ref: Reference<Location> | undefined
): CcdaParticipant | undefined {
  if (!ref) {
    return undefined;
  }

  const location = converter.findResourceByReference(ref);
  if (!location) {
    return undefined;
  }

  return {
    '@_typeCode': 'LOC',
    participantRole: {
      '@_classCode': 'SDLOC',
      templateId: [{ '@_root': OID_ENCOUNTER_LOCATION }],
      id: mapIdentifiers(location.id, location.identifier),
      code: mapCodeableConceptToCcdaCode(location.type?.[0]),
      addr: location.address ? mapFhirAddressArrayToCcdaAddressArray([location.address]) : undefined,
      telecom: mapTelecom(location.telecom),
      playingEntity: {
        '@_classCode': 'PLC',
        name: location.name ? [location.name] : undefined,
      },
    },
  };
}
