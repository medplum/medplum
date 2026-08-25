// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle } from '@medplum/core';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';

/**
 * The search parameters the scheduling fields issue their searches against.
 *
 * A parameter nobody registered matches nothing, silently, with an empty bundle
 * rather than an error — so a story reads as a visit type with nothing configured.
 *
 * Written out rather than loaded from `@medplum/definitions` the way the tests do:
 * `readJson` reads from disk, and there is no disk in a browser.
 */
const SCHEDULING_SEARCH_PARAMETERS: Bundle<SearchParameter> = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Schedule-service-type',
        url: 'http://hl7.org/fhir/SearchParameter/Schedule-service-type',
        name: 'service-type',
        status: 'active',
        description: 'The type of appointments that can be booked into associated slot(s)',
        code: 'service-type',
        base: ['Schedule'],
        type: 'token',
        expression: 'Schedule.serviceType',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Schedule-active',
        url: 'http://hl7.org/fhir/SearchParameter/Schedule-active',
        name: 'active',
        status: 'active',
        description: 'Is the schedule in active use',
        code: 'active',
        base: ['Schedule'],
        type: 'token',
        expression: 'Schedule.active',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Schedule-actor',
        url: 'http://hl7.org/fhir/SearchParameter/Schedule-actor',
        name: 'actor',
        status: 'active',
        description: 'The individual (HealthcareService, Practitioner, Location, ...) to find a Schedule for',
        code: 'actor',
        base: ['Schedule'],
        type: 'reference',
        expression: 'Schedule.actor',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'PractitionerRole-practitioner',
        url: 'http://hl7.org/fhir/SearchParameter/PractitionerRole-practitioner',
        name: 'practitioner',
        status: 'active',
        description: 'Practitioner that is able to provide the defined services for the organization',
        code: 'practitioner',
        base: ['PractitionerRole'],
        type: 'reference',
        expression: 'PractitionerRole.practitioner',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'PractitionerRole-active',
        url: 'http://hl7.org/fhir/SearchParameter/PractitionerRole-active',
        name: 'active',
        status: 'active',
        description: 'Whether this practitioner role record is in active use',
        code: 'active',
        base: ['PractitionerRole'],
        type: 'token',
        expression: 'PractitionerRole.active',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'HealthcareService-name',
        url: 'http://hl7.org/fhir/SearchParameter/HealthcareService-name',
        name: 'name',
        status: 'active',
        description: 'A portion of the Healthcare service name',
        code: 'name',
        base: ['HealthcareService'],
        type: 'string',
        expression: 'HealthcareService.name',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'HealthcareService-location',
        url: 'http://hl7.org/fhir/SearchParameter/HealthcareService-location',
        name: 'location',
        status: 'active',
        description: 'The location of the Healthcare Service',
        code: 'location',
        base: ['HealthcareService'],
        type: 'reference',
        expression: 'HealthcareService.location',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Patient-name',
        url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
        name: 'name',
        status: 'active',
        description: 'A portion of either family or given name of the patient',
        code: 'name',
        base: ['Patient'],
        type: 'string',
        expression: 'Patient.name',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Patient-birthdate',
        url: 'http://hl7.org/fhir/SearchParameter/Patient-birthdate',
        name: 'birthdate',
        status: 'active',
        description: "The patient's date of birth",
        code: 'birthdate',
        base: ['Patient'],
        type: 'date',
        expression: 'Patient.birthDate',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Location-name',
        url: 'http://hl7.org/fhir/SearchParameter/Location-name',
        name: 'name',
        status: 'active',
        description: 'A portion of the location name or alias',
        code: 'name',
        base: ['Location'],
        type: 'string',
        expression: 'Location.name | Location.alias',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Location-physical-type',
        url: 'https://medplum.com/fhir/SearchParameter/Location-physical-type',
        name: 'physical-type',
        status: 'draft',
        description: 'The physical type of the Location resource',
        code: 'physical-type',
        base: ['Location'],
        type: 'token',
        expression: 'Location.physicalType',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Device-status',
        url: 'http://hl7.org/fhir/SearchParameter/Device-status',
        name: 'status',
        status: 'draft',
        description: 'active | inactive | entered-in-error | unknown',
        code: 'status',
        base: ['Device'],
        type: 'token',
        expression: 'Device.status',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Location-status',
        url: 'http://hl7.org/fhir/SearchParameter/Location-status',
        name: 'status',
        status: 'draft',
        description: 'Searches for locations with a specific kind of status',
        code: 'status',
        base: ['Location'],
        type: 'token',
        expression: 'Location.status',
      },
    },
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Practitioner-active',
        url: 'http://hl7.org/fhir/SearchParameter/Practitioner-active',
        name: 'active',
        status: 'draft',
        description: 'Whether the practitioner record is active',
        code: 'active',
        base: ['Practitioner'],
        type: 'token',
        expression: 'Practitioner.active',
      },
    },
  ],
};

let indexed = false;

/**
 * Registers those parameters once per page; the registry is global to
 * `@medplum/core`.
 */
export function indexSchedulingSearchParameters(): void {
  if (!indexed) {
    indexSearchParameterBundle(SCHEDULING_SEARCH_PARAMETERS);
    indexed = true;
  }
}
