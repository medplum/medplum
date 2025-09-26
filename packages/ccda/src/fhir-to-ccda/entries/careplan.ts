// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { CarePlan } from '@medplum/fhirtypes';
import { OID_INSTRUCTIONS } from '../../oids';
import { mapCodeableConceptToCcdaValue } from '../../systems';
import { CcdaCode, CcdaEntry } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapIdentifiers } from '../utils';

export function createPlanOfTreatmentCarePlanEntry(
  _converter: FhirToCcdaConverter,
  resource: CarePlan
): CcdaEntry | undefined {
  if (resource.status === 'completed') {
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'INT',
          templateId: [{ '@_root': OID_INSTRUCTIONS }],
          id: mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaValue(resource.category?.[0]) as CcdaCode,
          text: resource.description ? { '#text': resource.description } : createTextFromExtensions(resource.extension),
          statusCode: { '@_code': resource.status },
        },
      ],
    };
  }

  return undefined;
}
