// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DiagnosticReport, Observation } from '@medplum/fhirtypes';
import { OID_RESULT_ORGANIZER } from '../../oids';
import { mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaCode, CcdaEntry, CcdaId, CcdaOrganizerComponent } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { mapIdentifiers } from '../utils';
import { createCcdaObservation } from './observation';

export function createDiagnosticReportEntry(converter: FhirToCcdaConverter, resource: DiagnosticReport): CcdaEntry {
  const components: CcdaOrganizerComponent[] = [];

  if (resource.result) {
    for (const member of resource.result) {
      const child = converter.findResourceByReference(member);
      if (!child || child.resourceType !== 'Observation') {
        continue;
      }

      components.push({
        observation: [createCcdaObservation(converter, child as Observation)],
      });
    }
  }

  // Note: The effectiveTime is an interval that spans the effectiveTimes of the contained result observations.
  // Because all contained result observations have a required time stamp,
  // it is not required that this effectiveTime be populated.

  return {
    organizer: [
      {
        '@_classCode': 'CLUSTER',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_RESULT_ORGANIZER },
          { '@_root': OID_RESULT_ORGANIZER, '@_extension': '2015-08-01' },
        ],
        id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
        code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
        statusCode: { '@_code': 'completed' },
        component: components,
      },
    ],
  };
}
