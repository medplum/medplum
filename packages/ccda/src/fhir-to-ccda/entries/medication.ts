// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodeableConcept, DosageDoseAndRate, MedicationRequest } from '@medplum/fhirtypes';
import {
  OID_LOINC_CODE_SYSTEM,
  OID_MEDICATION_ACTIVITY,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL,
} from '../../oids';
import { LOINC_MEDICATION_INSTRUCTIONS, mapCodeableConceptToCcdaCode, MEDICATION_STATUS_MAPPER } from '../../systems';
import { CcdaCode, CcdaEffectiveTime, CcdaEntry, CcdaQuantity } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createTextFromExtensions, mapEffectiveDate, mapIdentifiers } from '../utils';

/**
 * Create the C-CDA medication entry for the FHIR medication.
 * @param converter - The FHIR to C-CDA converter.
 * @param med - The FHIR medication to create the C-CDA medication entry for.
 * @returns The C-CDA medication entry.
 */
export function createMedicationEntry(converter: FhirToCcdaConverter, med: MedicationRequest): CcdaEntry {
  // Get medication details either from contained resource or inline concept
  const medication = med.contained?.find((r) => r.resourceType === 'Medication');
  const medicationCode = medication?.code || med.medicationCodeableConcept;
  const manufacturer = medication?.manufacturer;

  const effectiveTime: CcdaEffectiveTime[] = [];

  if (med.dispenseRequest?.validityPeriod) {
    const mapped = mapEffectiveDate(undefined, med.dispenseRequest.validityPeriod);
    if (mapped) {
      effectiveTime.push(...mapped);
    }
  }

  if (med.dosageInstruction?.[0]?.timing?.repeat?.period) {
    effectiveTime.push({
      '@_xsi:type': 'PIVL_TS',
      '@_institutionSpecified': 'true',
      '@_operator': 'A',
      period: {
        '@_value': med.dosageInstruction[0].timing.repeat.period.toString(),
        '@_unit': med.dosageInstruction[0].timing.repeat.periodUnit,
      },
    });
  }

  return {
    substanceAdministration: [
      {
        '@_classCode': 'SBADM',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_MEDICATION_ACTIVITY, '@_extension': '2014-06-09' },
          { '@_root': OID_MEDICATION_ACTIVITY },
        ],
        id: [{ '@_root': med.id || crypto.randomUUID() }],
        text: createTextFromExtensions(med.extension),
        statusCode: { '@_code': MEDICATION_STATUS_MAPPER.mapFhirToCcdaWithDefault(med.status, 'active') },
        effectiveTime,
        routeCode: mapMedicationRoute(med.dosageInstruction?.[0]?.route),
        doseQuantity: mapDoseQuantity(med.dosageInstruction?.[0]?.doseAndRate?.[0]),
        consumable: {
          '@_typeCode': 'CSM',
          manufacturedProduct: [
            {
              '@_classCode': 'MANU',
              templateId: [
                { '@_root': OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL, '@_extension': '2014-06-09' },
                { '@_root': OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL },
              ],
              manufacturedMaterial: [
                {
                  code: [
                    {
                      ...(mapCodeableConceptToCcdaCode(medicationCode) as CcdaCode),
                      originalText: createTextFromExtensions(medication?.extension),
                    },
                  ],
                },
              ],
              manufacturerOrganization: manufacturer
                ? [
                    {
                      id: mapIdentifiers(
                        manufacturer.id,
                        manufacturer.identifier ? [manufacturer.identifier] : undefined
                      ),
                      name: [manufacturer.display as string],
                    },
                  ]
                : undefined,
            },
          ],
        },
        author: converter.mapAuthor(med.requester, med.authoredOn),
        entryRelationship: med.dosageInstruction
          ?.filter((instr) => !!instr.extension)
          ?.map((instr) => ({
            '@_typeCode': 'COMP',
            substanceAdministration: [
              {
                '@_classCode': 'SBADM',
                '@_moodCode': 'EVN',
                templateId: [{ '@_root': OID_MEDICATION_FREE_TEXT_SIG }],
                code: {
                  '@_code': LOINC_MEDICATION_INSTRUCTIONS,
                  '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                  '@_codeSystemName': 'LOINC',
                  '@_displayName': 'Medication Instructions',
                },
                text: createTextFromExtensions(instr.extension),
                consumable: {
                  manufacturedProduct: [
                    {
                      manufacturedLabeledDrug: [
                        {
                          '@_nullFlavor': 'NA',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          })),
      },
    ],
  };
}

/**
 * Map the FHIR medication route to the C-CDA medication route.
 * @param route - The route to map.
 * @returns The C-CDA medication route.
 */
function mapMedicationRoute(route: CodeableConcept | undefined): CcdaCode | undefined {
  if (!route) {
    return undefined;
  }
  return mapCodeableConceptToCcdaCode(route);
}

/**
 * Map the FHIR dose quantity to the C-CDA dose quantity.
 * @param doseAndRate - The dose and rate to map.
 * @returns The C-CDA dose quantity.
 */
function mapDoseQuantity(doseAndRate: DosageDoseAndRate | undefined): CcdaQuantity | undefined {
  if (!doseAndRate?.doseQuantity) {
    return undefined;
  }

  return {
    '@_value': doseAndRate.doseQuantity.value?.toString(),
    '@_unit': doseAndRate.doseQuantity.unit,
  };
}
