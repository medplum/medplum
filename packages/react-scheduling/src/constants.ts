// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';

export const LOCATION_PHYSICAL_TYPE_CODE_SYSTEM = HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/location-physical-type';

/** The identifier system for a US National Provider Identifier. */
export const NPI_SYSTEM = HTTP_HL7_ORG + '/fhir/sid/us-npi';

/** Marks the PractitionerRole the scheduling configuration keeps for a provider, valued with the provider's id. */
export const SERVICE_FACILITY_ROLE_SYSTEM = 'https://medplum.com/fhir/scheduling-service-facility-role';

/** Marks a provider the scheduling configuration created, and so keeps, valued with a UUID chosen on create. */
export const SCHEDULING_CONFIG_PROVIDER_SYSTEM = 'https://medplum.com/fhir/scheduling-config-provider';

// Note that these are used by the `Appointment.cancelationReason` field (one
// "L" in that field name in R4).
export const APPOINTMENT_CANCELLATION_REASON_VALUE_SET =
  HTTP_HL7_ORG + '/fhir/ValueSet/appointment-cancellation-reason';
export const APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM =
  HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/appointment-cancellation-reason';

/**
 * The search a Location typeahead offers sites from where one is set up, whatever its
 * status, so a site can be configured before it goes live.
 *
 * Excludes what a room is rather than admitting what a site is: `physicalType` is
 * optional, so `physical-type=si,bu` would hide a Location that never declared one.
 */
export const SERVICE_FACILITY_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };

/**
 * The search a Location typeahead offers sites from where one is booked at, which
 * leaves out a site that is inactive because it isn't live yet.
 *
 * Excludes `inactive` rather than admitting `active` for the same reason: `status` is
 * optional too, and a Location that never recorded one is still offered.
 */
export const BOOKABLE_SERVICE_FACILITY_SEARCH_CRITERIA = {
  ...SERVICE_FACILITY_SEARCH_CRITERIA,
  'status:not': 'inactive',
};
