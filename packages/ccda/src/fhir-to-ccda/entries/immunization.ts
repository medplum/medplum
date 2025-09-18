// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Immunization, ImmunizationPerformer, Organization, Practitioner } from '@medplum/fhirtypes';
import { mapFhirToCcdaDate } from '../../datetime';
import { OID_IMMUNIZATION_ACTIVITY, OID_IMMUNIZATION_MEDICATION_INFORMATION } from '../../oids';
import { IMMUNIZATION_STATUS_MAPPER, mapCodeableConceptToCcdaCode } from '../../systems';
import { CcdaCode, CcdaEntry, CcdaId, CcdaPerformer, CcdaSubstanceAdministration } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import {
  createTextFromExtensions,
  mapFhirAddressArrayToCcdaAddressArray,
  mapIdentifiers,
  mapNames,
  mapTelecom,
} from '../utils';

export function createImmunizationEntry(converter: FhirToCcdaConverter, immunization: Immunization): CcdaEntry {
  const manufacturer = immunization?.manufacturer;
  const result = {
    substanceAdministration: [
      {
        '@_classCode': 'SBADM',
        '@_moodCode': 'EVN',
        '@_negationInd': 'false',
        templateId: [
          { '@_root': OID_IMMUNIZATION_ACTIVITY },
          { '@_root': OID_IMMUNIZATION_ACTIVITY, '@_extension': '2015-08-01' },
        ],
        id: mapIdentifiers(immunization.id, immunization.identifier),
        text: createTextFromExtensions(immunization.extension),
        statusCode: {
          '@_code': IMMUNIZATION_STATUS_MAPPER.mapFhirToCcdaWithDefault(immunization.status, 'completed'),
        },
        effectiveTime: [{ '@_value': mapFhirToCcdaDate(immunization.occurrenceDateTime) }],
        consumable: {
          manufacturedProduct: [
            {
              '@_classCode': 'MANU',
              templateId: [
                { '@_root': OID_IMMUNIZATION_MEDICATION_INFORMATION },
                { '@_root': OID_IMMUNIZATION_MEDICATION_INFORMATION, '@_extension': '2014-06-09' },
              ],
              manufacturedMaterial: [
                {
                  code: [mapCodeableConceptToCcdaCode(immunization.vaccineCode) as CcdaCode],
                  lotNumberText: immunization.lotNumber ? [immunization.lotNumber] : undefined,
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
      },
    ],
  } satisfies CcdaEntry;

  if (immunization.performer) {
    (result.substanceAdministration[0] as CcdaSubstanceAdministration).performer = immunization.performer
      .map((p) => mapImmunizationPerformerToCcdaPerformer(converter, p))
      .filter(Boolean) as CcdaPerformer[];
  }

  return result;
}

/**
 * Map the FHIR author to the C-CDA performer.
 * @param converter - The FHIR to C-CDA converter.
 * @param performer - The performer to map.
 * @returns The C-CDA performer.
 */
export function mapImmunizationPerformerToCcdaPerformer(
  converter: FhirToCcdaConverter,
  performer: ImmunizationPerformer | undefined
): CcdaPerformer | undefined {
  if (!performer) {
    return undefined;
  }

  const resource = converter.findResourceByReference(performer.actor);
  if (!resource) {
    return undefined;
  }

  let practitioner: Practitioner | undefined = undefined;
  let organization: Organization | undefined = undefined;

  if (resource.resourceType === 'PractitionerRole') {
    practitioner = converter.findResourceByReference(resource.practitioner) as Practitioner;
    organization = converter.findResourceByReference(resource.organization) as Organization;
  } else if (resource.resourceType === 'Practitioner') {
    practitioner = resource as Practitioner;
  } else if (resource.resourceType === 'Organization') {
    organization = resource as Organization;
  }

  return {
    assignedEntity: {
      id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
      addr: mapFhirAddressArrayToCcdaAddressArray(practitioner?.address),
      telecom: mapTelecom(resource.telecom),
      assignedPerson: practitioner
        ? {
            id: mapIdentifiers(practitioner.id, practitioner.identifier) as CcdaId[],
            name: mapNames(practitioner.name),
          }
        : undefined,
      representedOrganization: organization
        ? {
            id: mapIdentifiers(organization.id, organization.identifier) as CcdaId[],
            name: organization.name ? [organization.name] : undefined,
            addr: mapFhirAddressArrayToCcdaAddressArray(organization.address),
            telecom: mapTelecom(organization.telecom),
          }
        : undefined,
    },
  };
}
