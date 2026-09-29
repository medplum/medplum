// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';

// Note that these are used by the `Appointment.cancelationReason` field (one
// "L" in that field name in R4).
export const APPOINTMENT_CANCELLATION_REASON_VALUE_SET =
  HTTP_HL7_ORG + '/fhir/ValueSet/appointment-cancellation-reason';
export const APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM =
  HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/appointment-cancellation-reason';

/**
 * The search a Location typeahead offers sites from, wherever one is picked.
 *
 * Excludes what a room is rather than admitting what a site is: `physicalType` is
 * optional, so `physical-type=si,bu` would hide a Location that never declared one.
 */
export const LOCATION_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };
