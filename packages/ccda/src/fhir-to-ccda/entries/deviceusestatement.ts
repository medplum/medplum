// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DeviceUseStatement } from '@medplum/fhirtypes';
import {
  OID_FDA_CODE_SYSTEM,
  OID_PROCEDURE_ACTIVITY_PROCEDURE,
  OID_PRODUCT_INSTANCE,
  OID_SNOMED_CT_CODE_SYSTEM,
} from '../../oids';
import { mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaCode, CcdaEntry, CcdaId } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { mapIdentifiers } from '../utils';

export function createDeviceUseStatementEntry(
  converter: FhirToCcdaConverter,
  resource: DeviceUseStatement
): CcdaEntry | undefined {
  const device = converter.findResourceByReference(resource.device);
  if (!device) {
    return undefined;
  }

  const ids: CcdaId[] = [];

  const deviceIds = mapIdentifiers(device.id, device.identifier);
  if (deviceIds) {
    ids.push(...deviceIds);
  }

  if (device.udiCarrier?.[0]?.deviceIdentifier) {
    ids.push({
      '@_root': OID_FDA_CODE_SYSTEM,
      '@_extension': device.udiCarrier[0].carrierHRF,
      '@_assigningAuthorityName': 'FDA',
    });
  }

  return {
    procedure: [
      {
        '@_classCode': 'PROC',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
          { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE },
        ],
        id: mapIdentifiers(resource.id, resource.identifier),
        code: {
          '@_code': '360030002',
          '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
          '@_codeSystemName': 'SNOMED CT',
          '@_displayName': 'Application of medical device',
        },
        statusCode: {
          '@_code': 'completed',
        },
        participant: [
          {
            '@_typeCode': 'DEV',
            participantRole: {
              '@_classCode': 'MANU',
              templateId: [{ '@_root': OID_PRODUCT_INSTANCE }],
              id: ids,
              playingDevice: {
                '@_classCode': 'DEV',
                code: mapCodeableConceptToCcdaCode(device.type) as CcdaCode,
              },
              scopingEntity: {
                id: [{ '@_root': OID_FDA_CODE_SYSTEM }],
              },
            },
          },
        ],
      },
    ],
  };
}
