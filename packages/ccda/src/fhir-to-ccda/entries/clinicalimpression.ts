// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ClinicalImpression } from '@medplum/fhirtypes';
import { mapFhirToCcdaDate } from '../../datetime';
import { OID_LOINC_CODE_SYSTEM, OID_NOTE_ACTIVITY } from '../../oids';
import { LOINC_NOTES_SECTION, mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaEntry } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapIdentifiers } from '../utils';

export function createClinicalImpressionEntry(
  converter: FhirToCcdaConverter,
  resource: ClinicalImpression
): CcdaEntry | undefined {
  return {
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [{ '@_root': OID_NOTE_ACTIVITY, '@_extension': '2016-11-01' }],
        id: mapIdentifiers(resource.id, resource.identifier),
        code: mapCodeableConceptToCcdaCode(resource.code) ?? {
          '@_code': LOINC_NOTES_SECTION,
          '@_codeSystem': OID_LOINC_CODE_SYSTEM,
          '@_codeSystemName': 'LOINC',
          '@_displayName': 'Note',
        },
        text: resource.summary ? { '#text': resource.summary } : createTextFromExtensions(resource.extension),
        statusCode: { '@_code': 'completed' },
        effectiveTime: [{ '@_value': mapFhirToCcdaDate(resource.date) }],
        author: converter.mapAuthor(resource.assessor, resource.date),
      },
    ],
  };
}
