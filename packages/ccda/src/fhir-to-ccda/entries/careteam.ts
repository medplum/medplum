// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CareTeam } from '@medplum/fhirtypes';
import { OID_CARE_TEAM_ORGANIZER_ENTRY } from '../../oids';
import { CcdaEntry, CcdaId, CcdaOrganizerComponent } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { mapIdentifiers } from '../utils';

export function createCareTeamEntry(_converter: FhirToCcdaConverter, careTeam: CareTeam): CcdaEntry {
  return {
    organizer: [
      {
        '@_classCode': 'CLUSTER',
        '@_moodCode': 'EVN',
        templateId: [
          {
            '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
            '@_extension': '2022-07-01',
          },
          {
            '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
            '@_extension': '2022-06-01',
          },
        ],
        id: mapIdentifiers(careTeam.id, careTeam.identifier) as CcdaId[],
        component: careTeam.participant?.map((participant) => ({
          '@_typeCode': 'PRF',
          role: participant.role,
        })) as CcdaOrganizerComponent[],
      },
    ],
  };
}
