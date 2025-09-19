// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SNOMED } from '@medplum/core';
import { ServiceRequest } from '@medplum/fhirtypes';
import { mapFhirToCcdaDateTime } from '../../datetime';
import { OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION, OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE } from '../../oids';
import { mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaCode, CcdaEntry, CcdaId } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapIdentifiers } from '../utils';

export function createPlanOfTreatmentServiceRequestEntry(
  _converter: FhirToCcdaConverter,
  resource: ServiceRequest
): CcdaEntry {
  // Under some circumstances, we need to use a `<procedure>` element instead of an `<observation>` element.
  // This is a pretty nasty interoperability quirk, but it's what C-CDA requires.
  // The quick 80/20 solution is to use `<procedure>` when ServiceRequest.code is a SNOMED CT code.
  const system = resource.code?.coding?.[0]?.system;
  if (system === SNOMED) {
    return {
      procedure: [
        {
          '@_classCode': 'PROC',
          '@_moodCode': 'RQO',
          templateId: [
            { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE },
            { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
            { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2022-06-01' },
          ],
          id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
          code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
          statusCode: { '@_code': 'active' }, // USCDI v2 requires statusCode to be "active"
          effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.authoredOn) }],
          text: createTextFromExtensions(resource.extension),
        },
      ],
    };
  }

  const result: CcdaEntry = {
    observation: [
      {
        '@_classCode': 'OBS',
        '@_moodCode': 'RQO',
        templateId: [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }],
        id: mapIdentifiers(resource.id, resource.identifier),
        code: mapCodeableConceptToCcdaCode(resource.code),
        statusCode: { '@_code': mapPlanOfTreatmentStatus(resource.status) },
        effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.occurrenceDateTime) }],
        text: createTextFromExtensions(resource.extension),
      },
    ],
  };

  return result;
}

export function mapPlanOfTreatmentStatus(status: ServiceRequest['status'] | undefined): string {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'entered-in-error':
      return 'cancelled';
    default:
      return 'active';
  }
}
