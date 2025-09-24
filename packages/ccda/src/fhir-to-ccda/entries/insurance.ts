// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Account, Organization, RelatedPerson } from '@medplum/fhirtypes';
import { mapFhirToCcdaDate } from '../../datetime';
import {
  OID_COVERAGE_ACTIVITY,
  OID_COVERED_PARTY_PARTICIPANT,
  OID_LOINC_CODE_SYSTEM,
  OID_PAYER_PERFORMER,
  OID_POLICY_ACTIVITY,
  OID_POLICY_HOLDER_PARTICIPANT,
} from '../../oids';
import { INSURANCE_COVERAGE_TYPE_MAPPER } from '../../systems';
import { CcdaEntry, CcdaEntryRelationship, CcdaId, CcdaParticipant } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import {
  createTextFromExtensions,
  mapFhirAddressArrayToCcdaAddressArray,
  mapIdentifiers,
  mapNames,
  mapTelecom,
} from '../utils';

export function createInsuranceEntry(converter: FhirToCcdaConverter, account: Account): CcdaEntry | undefined {
  const entryRelationship: CcdaEntryRelationship[] = [];

  if (account.coverage) {
    for (const accountCoverage of account.coverage) {
      const coverage = converter.findResourceByReference(accountCoverage.coverage);
      if (!coverage || coverage.resourceType !== 'Coverage') {
        continue;
      }

      const coveragePlan = coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan');
      const payor = converter.findResourceByReference(coverage.payor?.[0]) as Organization | undefined;
      const policyHolder = converter.findResourceByReference(coverage.policyHolder) as RelatedPerson | undefined;

      entryRelationship.push({
        '@_typeCode': 'COMP',
        sequenceNumber: { '@_xsi:type': 'INT', '@_value': entryRelationship.length.toString() },
        act: [
          {
            '@_classCode': 'ACT',
            '@_moodCode': 'EVN',
            templateId: [
              { '@_root': OID_POLICY_ACTIVITY, '@_extension': '2015-08-01' },
              { '@_root': OID_POLICY_ACTIVITY },
            ],
            id: mapIdentifiers(coverage.id, coverage.identifier) as CcdaId[],
            code: {
              '@_code': INSURANCE_COVERAGE_TYPE_MAPPER.mapFhirToCcdaWithDefault(
                coverage.type?.coding?.[0]?.code,
                '9999'
              ),
              '@_displayName': coverage.type?.coding?.[0]?.display || 'Unknown',
              '@_codeSystemName': 'Source of Payment Typology (PHDSC)',
              '@_codeSystem': '2.16.840.1.113883.3.221.5',
            },
            statusCode: { '@_code': 'completed' },
            text: createTextFromExtensions(coverage.extension),
            performer: [
              {
                '@_typeCode': 'PRF',
                templateId: [{ '@_root': OID_PAYER_PERFORMER }],
                assignedEntity: {
                  id: [{ '@_root': '2.16.840.1.113883.6.300', '@_extension': '999999' }],
                  code: {
                    '@_code': 'PAYOR',
                    '@_codeSystem': '2.16.840.1.113883.5.110',
                    '@_codeSystemName': 'HL7 RoleCode',
                    '@_displayName': 'invoice payor',
                  },
                  addr: mapFhirAddressArrayToCcdaAddressArray(payor?.address),
                  telecom: mapTelecom(payor?.telecom),
                  representedOrganization: {
                    name: payor?.name ? [payor.name] : undefined,
                    telecom: mapTelecom(payor?.telecom),
                    addr: mapFhirAddressArrayToCcdaAddressArray(payor?.address),
                  },
                },
              },
            ],
            participant: [
              {
                '@_typeCode': 'COV',
                templateId: [{ '@_root': OID_COVERED_PARTY_PARTICIPANT }],
                participantRole: {
                  '@_classCode': 'PAT',
                  id: [
                    {
                      '@_root': '2.16.840.1.113883.6.300',
                      '@_extension': policyHolder?.identifier?.[0]?.value || '88800933502',
                    },
                  ],
                  code: {
                    '@_code': 'FAMDEP',
                    '@_codeSystem': '2.16.840.1.113883.5.111',
                    '@_displayName': policyHolder ? 'self' : 'dependent',
                  },
                  addr: mapFhirAddressArrayToCcdaAddressArray(policyHolder?.address),
                  playingEntity: {
                    '@_classCode': 'PSN',
                    name: mapNames(policyHolder?.name),
                    'sdtc:birthTime': policyHolder?.birthDate
                      ? { '@_value': mapFhirToCcdaDate(policyHolder.birthDate) }
                      : undefined,
                  },
                },
              },
              policyHolder
                ? {
                    '@_typeCode': 'HLD',
                    templateId: [{ '@_root': OID_POLICY_HOLDER_PARTICIPANT }],
                    participantRole: {
                      id: [
                        {
                          '@_root': '2.16.840.1.113883.6.300',
                          '@_extension': policyHolder.identifier?.[0]?.value || '888009335',
                        },
                      ],
                      addr: mapFhirAddressArrayToCcdaAddressArray(policyHolder.address),
                      playingEntity: {
                        name: mapNames(policyHolder.name),
                      },
                    },
                  }
                : undefined,
            ].filter(Boolean) as CcdaParticipant[],
            entryRelationship: [
              {
                '@_typeCode': 'REFR',
                act: [
                  {
                    '@_classCode': 'ACT',
                    '@_moodCode': 'DEF',
                    id: mapIdentifiers(coverage.id, coverage.identifier) as CcdaId[],
                    code: {
                      '@_code': 'PAYOR',
                      '@_codeSystem': '2.16.840.1.113883.5.110',
                      '@_codeSystemName': 'HL7 RoleCode',
                      '@_displayName': 'invoice payor',
                    },
                    text: coveragePlan?.value ? { '#text': coveragePlan.value } : undefined,
                  },
                ],
              },
            ],
          },
        ],
      });
    }
  }

  return {
    act: [
      {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_COVERAGE_ACTIVITY, '@_extension': '2015-08-01' },
          { '@_root': OID_COVERAGE_ACTIVITY },
        ],
        id: mapIdentifiers(account.id, account.identifier),
        code: {
          '@_code': '48768-6',
          '@_codeSystem': OID_LOINC_CODE_SYSTEM,
          '@_codeSystemName': 'LOINC',
          '@_displayName': 'Payment Sources',
        },
        statusCode: { '@_code': 'completed' },
        entryRelationship,
      },
    ],
  };
}
