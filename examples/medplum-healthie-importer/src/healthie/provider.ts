// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CodeableConcept,
  Identifier,
  Practitioner,
  PractitionerQualification,
  PractitionerRole,
} from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
import { HEALTHIE_PROVIDER_ID_SYSTEM, HEALTHIE_PROVIDER_ROLE_ID_SYSTEM, NPI_SYSTEM } from './constants';

export interface HealthieSpecialty {
  id: string;
  specialty?: string;
  specialty_category?: string;
}

export interface HealthieProfession {
  id: string;
  profession?: string;
  profession_category?: string;
}

export interface HealthieStateLicense {
  id: string;
  state?: string;
  full_state_name?: string;
}

export interface HealthieOrganization {
  id: string;
  name?: string;
}

export interface HealthieProvider {
  id: string;
  first_name?: string;
  last_name?: string;
  is_active_provider?: boolean;
  npi?: string;
  license_num?: string;
  qualifications?: string;
  phone_number?: string;
  email?: string;
  specialties?: HealthieSpecialty[];
  professions?: HealthieProfession[];
  state_licenses?: HealthieStateLicense[];
  organization?: HealthieOrganization;
}

export async function fetchOrganizationMembers(healthie: HealthieClient): Promise<HealthieProvider[]> {
  const query = `
    query fetchOrganizationMembers {
      organizationMembers {
        id
        first_name
        last_name
        is_active_provider
        npi
        license_num
        qualifications
        phone_number
        email
        specialties {
          id
          specialty
          specialty_category
        }
        professions {
          id
          profession
          profession_category
        }
        state_licenses {
          id
          state
          full_state_name
        }
        organization {
          id
          name
        }
      }
    }
  `;

  const result = await healthie.query<{ organizationMembers: HealthieProvider[] | null }>(query);
  const members = result.organizationMembers ?? [];
  return members.filter((m) => m.is_active_provider !== false);
}

export function convertHealthieProviderToPractitioner(provider: HealthieProvider): Practitioner {
  const identifiers: Identifier[] = [{ system: HEALTHIE_PROVIDER_ID_SYSTEM, value: provider.id }];

  if (provider.npi) {
    identifiers.push({ system: NPI_SYSTEM, value: provider.npi });
  }

  const telecom: Practitioner['telecom'] = [];
  if (provider.phone_number) {
    telecom.push({ system: 'phone', value: provider.phone_number });
  }
  if (provider.email) {
    telecom.push({ system: 'email', value: provider.email });
  }

  const practitioner: Practitioner = {
    resourceType: 'Practitioner',
    identifier: identifiers,
    active: provider.is_active_provider ?? true,
    name: buildPractitionerName(provider),
    telecom: telecom.length > 0 ? telecom : undefined,
    qualification: buildQualifications(provider),
  };

  return practitioner;
}

export function convertHealthieProviderToPractitionerRole(
  provider: HealthieProvider,
  practitionerIdentifier: Identifier
): PractitionerRole {
  const role: PractitionerRole = {
    resourceType: 'PractitionerRole',
    identifier: [{ system: HEALTHIE_PROVIDER_ROLE_ID_SYSTEM, value: provider.id }],
    active: provider.is_active_provider ?? true,
    practitioner: { identifier: practitionerIdentifier },
    specialty: buildSpecialtyCodes(provider.specialties),
    code: buildRoleCode(provider.professions),
  };

  return role;
}

function buildPractitionerName(provider: HealthieProvider): Practitioner['name'] {
  if (!provider.first_name && !provider.last_name) {
    return undefined;
  }
  return [
    {
      given: provider.first_name ? [provider.first_name] : undefined,
      family: provider.last_name || undefined,
    },
  ];
}

function buildQualifications(provider: HealthieProvider): PractitionerQualification[] | undefined {
  const qualifications: PractitionerQualification[] = [];

  if (provider.specialties) {
    for (const spec of provider.specialties) {
      if (!spec.specialty) {
        continue;
      }
      qualifications.push({
        code: {
          text: spec.specialty,
          coding: [
            {
              system: `${HEALTHIE_PROVIDER_ID_SYSTEM}/specialty`,
              code: spec.id,
              display: spec.specialty,
            },
          ],
        },
      });
    }
  }

  if (provider.state_licenses) {
    for (const license of provider.state_licenses) {
      if (!license.state) {
        continue;
      }
      const qualification: PractitionerQualification = {
        code: {
          text: `License - ${license.full_state_name || license.state}`,
          coding: [
            {
              system: `${HEALTHIE_PROVIDER_ID_SYSTEM}/stateLicense`,
              code: license.id,
              display: `License - ${license.full_state_name || license.state}`,
            },
          ],
        },
      };
      if (provider.license_num && provider.state_licenses.length === 1) {
        qualification.identifier = [{ value: provider.license_num }];
      }
      qualifications.push(qualification);
    }
  }

  return qualifications.length > 0 ? qualifications : undefined;
}

function buildSpecialtyCodes(specialties?: HealthieSpecialty[]): CodeableConcept[] | undefined {
  if (!specialties || specialties.length === 0) {
    return undefined;
  }

  const codes: CodeableConcept[] = [];
  for (const spec of specialties) {
    if (!spec.specialty) {
      continue;
    }
    codes.push({
      text: spec.specialty,
      coding: [
        {
          system: `${HEALTHIE_PROVIDER_ID_SYSTEM}/specialty`,
          code: spec.id,
          display: spec.specialty,
        },
      ],
    });
  }
  return codes.length > 0 ? codes : undefined;
}

function buildRoleCode(professions?: HealthieProfession[]): CodeableConcept[] | undefined {
  if (!professions || professions.length === 0) {
    return undefined;
  }

  const codes: CodeableConcept[] = [];
  for (const prof of professions) {
    if (!prof.profession) {
      continue;
    }
    codes.push({
      text: prof.profession,
      coding: [
        {
          system: `${HEALTHIE_PROVIDER_ID_SYSTEM}/profession`,
          code: prof.id,
          display: prof.profession,
        },
      ],
    });
  }
  return codes.length > 0 ? codes : undefined;
}
