// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Extension, HealthcareService, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';

// The `SchedulingParameters` extension as it appears on a HealthcareService.
const schedulingParamsHealthcareService: Extension =
  // start-block schedulingParamsHealthcareService
  {
    url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
    // set duration / alignmentInterval / alignmentTimezone HERE; all schedules booked together must match on these
    extension: [
      // Recommended: duration determines how long the time increments for a Slot are.
      // If not set here, must be defined on all related Schedules. To book on multiple
      // schedules at once, they must all match in this dimension.
      {
        url: 'duration',
        valueDuration: { value: 1, unit: 'h' },
      },

      // Recommended: Time alignment interval (appointment start time boundaries)
      // To book on multiple schedules at once, they must all match in this dimension.
      {
        url: 'alignmentInterval',
        valueDuration: { value: 15, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Recommended: Time alignment offset (shift from interval boundaries)
      // To book on multiple schedules at once, they must all match in this dimension.
      {
        url: 'alignmentOffset',
        valueDuration: { value: 0, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Optional: Timezone for anchoring the alignment grid to local midnight
      // Independent of `timezone`, which controls availability window interpretation
      {
        url: 'alignmentTimezone',
        valueCode: 'America/New_York',
      },

      // Optional: specify time zone for availability interpretation
      // Falls back to Schedule's actor time zone if not specified
      {
        url: 'timezone',
        valueCode: 'America/Los_Angeles',
      },

      // Optional: Buffer time required before appointment
      {
        url: 'bufferBefore',
        valueDuration: { value: 15, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Optional: Buffer time required after appointment
      {
        url: 'bufferAfter',
        valueDuration: { value: 10, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },
    ],
  };
// end-block schedulingParamsHealthcareService

// The `SchedulingParameters` extension as it appears on a Schedule.
const schedulingParamsSchedule: Extension =
  // start-block schedulingParamsSchedule
  {
    url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
    extension: [
      // Required on Schedule: you must specify what type of appointment these parameters apply to
      {
        url: 'service',
        valueReference: {
          reference: 'HealthcareService/5d02acfd-fbe8-4537-84e4-31f5116be105',
          display: 'Bariatric Surgery',
        },
      },

      // Optional: specify time zone for availability interpretation
      // Falls back to Schedule's actor time zone if not specified
      {
        url: 'timezone',
        valueCode: 'America/Los_Angeles',
      },

      // Optional: duration determines how long the time increments for a Slot are.
      // If not set here, must be defined on the related HealthcareService
      {
        url: 'duration',
        valueDuration: { value: 1, unit: 'h' },
      },

      // Recurring availability (Schedule only)
      {
        url: 'availability',
        extension: [
          {
            url: 'availableTime',
            extension: [
              { url: 'daysOfWeek', valueCode: 'mon' },
              { url: 'daysOfWeek', valueCode: 'wed' },
              { url: 'daysOfWeek', valueCode: 'fri' },
              { url: 'availableStartTime', valueTime: '09:00:00' },
              { url: 'availableEndTime', valueTime: '17:00:00' },
            ],
          },
        ],
      },

      // Buffer time before appointment
      {
        url: 'bufferBefore',
        valueDuration: { value: 15, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Buffer time after appointment
      {
        url: 'bufferAfter',
        valueDuration: { value: 10, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Time alignment interval (appointment start time boundaries)
      {
        url: 'alignmentInterval',
        valueDuration: { value: 15, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Time alignment offset (shift from interval boundaries)
      {
        url: 'alignmentOffset',
        valueDuration: { value: 0, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
      },

      // Timezone for anchoring the alignment grid to local midnight
      // Independent of `timezone`, which controls availability window interpretation
      {
        url: 'alignmentTimezone',
        valueCode: 'America/New_York',
      },
    ],
  };
// end-block schedulingParamsSchedule

// A Schedule that defines actor-level availability for a Practitioner.
const scheduleResource: Schedule =
  // start-block scheduleResource
  {
    resourceType: 'Schedule',
    id: 'dr-smith-schedule',
    // Schedule has no 'name' field in R4 - use comment for a label
    comment: "Dr. Smith's Office Visit availability",
    // Practitioner or PractitionerRole; the actor must carry a timezone extension
    actor: [{ reference: 'Practitioner/dr-smith' }],
    serviceType: [
      {
        text: 'Office Visit',
        coding: [{ code: 'office-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e',
              display: 'Office Visit',
            },
          },
        ],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e',
              display: 'Office Visit',
            },
          },
          {
            url: 'duration',
            valueDuration: { value: 1, unit: 'h' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'daysOfWeek', valueCode: 'fri' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block scheduleResource

// A Schedule showing the `availability` sub-extension in detail.
const scheduleAvailability: Schedule =
  // start-block scheduleAvailability
  {
    resourceType: 'Schedule',
    id: 'dr-smith-schedule',
    comment: "Dr. Smith's Office Visit availability",
    actor: [{ reference: 'Practitioner/dr-smith' }],
    serviceType: [
      {
        text: 'Office Visit',
        coding: [{ code: 'office-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e',
              display: 'Office Visit',
            },
          },
        ],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e',
              display: 'Office Visit',
            },
          },
          {
            url: 'duration',
            valueDuration: { value: 1, unit: 'h' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'daysOfWeek', valueCode: 'fri' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block scheduleAvailability

// A HealthcareService that defines shared scheduling parameters for an appointment type.
const healthcareServiceServiceLevel: HealthcareService =
  // start-block healthcareServiceServiceLevel
  {
    resourceType: 'HealthcareService',
    id: '23c3f1cc-4f55-4990-9775-511b02487e7e',
    type: [
      {
        text: 'Office Visit',
        coding: [{ system: 'http://example.org/appointment-types', code: 'office-visit' }],
      },
    ],
    availableTime: [
      {
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        availableStartTime: '09:00:00',
        availableEndTime: '17:00:00',
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        // set duration / alignmentInterval / alignmentTimezone HERE; all schedules booked together must match on these
        extension: [
          {
            url: 'duration',
            valueDuration: { value: 1, unit: 'h' },
          },
        ],
      },
    ],
  };
// end-block healthcareServiceServiceLevel

// A Schedule that links to a HealthcareService via its `serviceType` extension.
const scheduleServiceTypeLink: Schedule =
  // start-block scheduleServiceTypeLink
  {
    resourceType: 'Schedule',
    id: 'dr-smith-schedule',
    comment: "Dr. Smith's Office Visit availability",
    actor: [{ reference: 'Practitioner/dr-smith' }],
    serviceType: [
      {
        text: 'Office Visit',
        coding: [{ code: 'office-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e',
              display: 'Office Visit',
            },
          },
        ],
      },
    ],
  };
// end-block scheduleServiceTypeLink

// A Schedule that overrides only `availability`, inheriting everything else from the HealthcareService.
const scheduleOverride: Schedule =
  // start-block scheduleOverride
  {
    resourceType: 'Schedule',
    id: 'dr-chen-schedule',
    active: true,
    comment: 'Dr. Chen - New Patient Visit (Tue/Thu mornings only)',
    actor: [{ reference: 'Practitioner/dr-chen' }],
    serviceType: [
      {
        coding: [{ code: 'new-patient-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/f44bbf25-bf57-4263-8f10-be060cc91672',
              display: 'New Patient Visit',
            },
          },
        ],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            // required: identifies which HealthcareService these parameters override
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/f44bbf25-bf57-4263-8f10-be060cc91672',
              display: 'New Patient Visit',
            },
          },
          {
            // overridden here; duration, buffers, and alignment are inherited from HealthcareService
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '13:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block scheduleOverride

// A Slot that blocks time for a specific service type.
const slotBlocking: Slot =
  // start-block slotBlocking
  {
    resourceType: 'Slot',
    schedule: { reference: 'Schedule/dr-johnson-schedule' },
    status: 'busy-unavailable',
    start: '2025-12-24T08:00:00Z',
    end: '2025-12-27T07:59:59Z',
    comment: 'Holiday vacation',
    serviceType: [{ coding: [{ code: 'office-visit' }] }],
  };
// end-block slotBlocking

// Adding a timezone to an actor (Practitioner, Location, or Device) via the FHIR timezone extension.
const actorTimezone: Practitioner =
  // start-block actorTimezone
  {
    resourceType: 'Practitioner',
    // ...
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/timezone',
        valueCode: 'America/Los_Angeles',
      },
    ],
  };
// end-block actorTimezone

// A Schedule with multiple service types, each interpreted in its own timezone.
const multiTimezoneSchedule: Schedule =
  // start-block multiTimezoneSchedule
  {
    resourceType: 'Schedule',
    id: 'dr-smith-schedule',
    comment: 'Dr. Smith - Cardiac Surgery (PT) and Call Center (ET)',
    actor: [{ reference: 'Practitioner/dr-smith' }],
    serviceType: [
      {
        text: 'Cardiac Surgery',
        coding: [{ code: 'cardiac-surgery' }],
      },
      {
        text: 'Call Center Availability',
        coding: [{ code: 'call-center-availability' }],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/a8f88a98-2578-4644-b408-7ba73f104298',
              display: 'Cardiac Surgery',
            },
          },
          {
            url: 'timezone',
            valueCode: 'America/Los_Angeles',
          },
          {
            url: 'duration',
            valueDuration: { value: 1, unit: 'h' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'availableStartTime', valueTime: '11:00:00' }, // Interpreted in America/Los_Angeles
                  { url: 'availableEndTime', valueTime: '15:00:00' }, // Interpreted in America/Los_Angeles
                ],
              },
            ],
          },
        ],
      },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'timezone',
            valueCode: 'America/New_York',
          },
          {
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/0dbe6bf1-40b8-4204-a406-f78b5a0e59d0',
              display: 'Call Center Availability',
            },
          },
          {
            url: 'duration',
            valueDuration: { value: 1, unit: 'h' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'availableStartTime', valueTime: '09:00:00' }, // Interpreted in America/New_York
                  { url: 'availableEndTime', valueTime: '17:00:00' }, // Interpreted in America/New_York
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block multiTimezoneSchedule

// Example 1 - HealthcareService: Office Visit defaults (30-min visit, 5-min buffers, 15-min alignment).
const officeVisitService: HealthcareService =
  // start-block officeVisitService
  {
    resourceType: 'HealthcareService',
    id: 'office-visit',
    type: [
      {
        text: 'Office Visit',
        coding: [{ system: 'http://example.org/appointment-types', code: 'office-visit', display: 'Office Visit' }],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'duration',
            valueDuration: { value: 30, unit: 'min' },
          },
          { url: 'bufferBefore', valueDuration: { value: 5, unit: 'min' } },
          { url: 'bufferAfter', valueDuration: { value: 5, unit: 'min' } },
          { url: 'alignmentInterval', valueDuration: { value: 15, unit: 'min' } },
          { url: 'alignmentOffset', valueDuration: { value: 0, unit: 'min' } },
        ],
      },
    ],
  };
// end-block officeVisitService

// Example 1 - Schedule: Dr. Johnson inherits all defaults from the HealthcareService.
const drJohnsonSchedule: Schedule =
  // start-block drJohnsonSchedule
  {
    resourceType: 'Schedule',
    id: 'dr-johnson-schedule',
    active: true,
    comment: "Dr. Sarah Johnson's Office Visit availability",
    actor: [
      {
        reference: 'Practitioner/dr-johnson',
        display: 'Dr. Sarah Johnson',
      },
    ],
    planningHorizon: {
      start: '2025-01-01T00:00:00Z',
      end: '2025-12-31T23:59:59Z',
    },
    serviceType: [
      // This entry will allow using the office-visit shared HealthcareService definitions
      {
        text: 'Office Visit',
        coding: [{ code: 'office-visit' }],
      },
    ],
    // No SchedulingParameters extension: everything is inherited from the HealthcareService
  };
// end-block drJohnsonSchedule

// Example 2 - HealthcareService: New Patient Visit (60 min, 15-min buffers, 30-min alignment).
const newPatientService: HealthcareService =
  // start-block newPatientService
  {
    resourceType: 'HealthcareService',
    id: 'new-patient-visit',
    type: [
      {
        text: 'New Patient Visit',
        coding: [
          { system: 'http://example.org/appointment-types', code: 'new-patient-visit', display: 'New Patient Visit' },
        ],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { value: 1, unit: 'h' } },
          { url: 'bufferBefore', valueDuration: { value: 15, unit: 'min' } },
          { url: 'bufferAfter', valueDuration: { value: 15, unit: 'min' } },
          { url: 'alignmentInterval', valueDuration: { value: 30, unit: 'min' } },
        ],
      },
    ],
  };
// end-block newPatientService

// Example 2 - HealthcareService: Follow-up Visit (20 min, 5-min buffers, 10-min alignment).
const followUpService: HealthcareService =
  // start-block followUpService
  {
    resourceType: 'HealthcareService',
    id: 'follow-up-visit',
    type: [
      {
        text: 'Follow-up Visit',
        coding: [{ system: 'http://example.org/appointment-types', code: 'follow-up', display: 'Follow-up Visit' }],
      },
    ],
    availableTime: [
      {
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        availableStartTime: '09:00:00',
        availableEndTime: '17:00:00',
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { value: 20, unit: 'min' } },
          { url: 'bufferBefore', valueDuration: { value: 5, unit: 'min' } },
          { url: 'bufferAfter', valueDuration: { value: 5, unit: 'min' } },
          { url: 'alignmentInterval', valueDuration: { value: 10, unit: 'min' } },
        ],
      },
    ],
  };
// end-block followUpService

// Example 2 - Schedule: bookable for both service types, overriding availability for New Patient Visit.
const multiServiceSchedule: Schedule =
  // start-block multiServiceSchedule
  {
    resourceType: 'Schedule',
    id: 'dr-chen-schedule',
    active: true,
    comment: 'Dr. Chen - New Patient and Follow-up Visits',
    actor: [{ reference: 'PractitionerRole/dr-chen' }],
    planningHorizon: {
      start: '2025-01-01T00:00:00Z',
      end: '2025-12-31T23:59:59Z',
    },
    serviceType: [
      {
        text: 'New Patient Visit',
        coding: [{ system: 'http://example.org/appointment-types', code: 'new-patient-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/new-patient-visit',
              display: 'New Patient Visit',
            },
          },
        ],
      },
      {
        text: 'Follow-up Visit',
        coding: [{ system: 'http://example.org/appointment-types', code: 'follow-up' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/follow-up',
              display: 'Follow-up Visit',
            },
          },
        ],
      },
    ],
    extension: [
      // New patient visits only on Tuesday and Thursday mornings
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: {
              reference: 'HealthcareService/new-patient-visit',
              display: 'New Patient Visit',
            },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '13:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block multiServiceSchedule

// Example 3 - HealthcareService: Bariatric Surgery (120 min, 45/30-min buffers).
const bariatricService: HealthcareService =
  // start-block bariatricService
  {
    resourceType: 'HealthcareService',
    id: 'bariatric-surgery',
    type: [
      {
        coding: [{ system: 'http://snomed.info/sct', code: '287809009', display: 'Bariatric Surgery' }],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { value: 120, unit: 'min' } },
          { url: 'bufferBefore', valueDuration: { value: 45, unit: 'min' } },
          { url: 'bufferAfter', valueDuration: { value: 30, unit: 'min' } },
          { url: 'alignmentInterval', valueDuration: { value: 30, unit: 'min' } },
        ],
      },
    ],
  };
// end-block bariatricService

// Example 3 - Schedule: Surgeon availability for bariatric surgery.
const surgeonSchedule: Schedule =
  // start-block surgeonSchedule
  {
    resourceType: 'Schedule',
    id: 'surgeon-martinez-schedule',
    active: true,
    comment: 'Dr. Maria Martinez (Surgeon) - Bariatric Surgery',
    serviceType: [
      {
        coding: [{ system: 'http://snomed.info/sct', code: '287809009' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
        ],
      },
    ],
    actor: [
      {
        reference: 'Practitioner/surgeon-martinez',
        display: 'Dr. Maria Martinez - Bariatric Surgeon',
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'availableStartTime', valueTime: '08:00:00' },
                  { url: 'availableEndTime', valueTime: '16:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block surgeonSchedule

// Example 3 - Schedule: Operating Room 3 availability.
const operatingRoomSchedule: Schedule =
  // start-block operatingRoomSchedule
  {
    resourceType: 'Schedule',
    id: 'or-3-schedule',
    active: true,
    comment: 'Operating Room 3 - Bariatric Surgery',
    actor: [
      {
        reference: 'Location/or-3',
        display: 'Operating Room 3',
      },
    ],
    serviceType: [
      {
        coding: [{ system: 'http://snomed.info/sct', code: '287809009' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
        ],
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'daysOfWeek', valueCode: 'fri' },
                  { url: 'availableStartTime', valueTime: '07:00:00' },
                  { url: 'availableEndTime', valueTime: '19:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block operatingRoomSchedule

// Example 3 - Schedule: Anesthesiologist availability.
const anesthesiologistSchedule: Schedule =
  // start-block anesthesiologistSchedule
  {
    resourceType: 'Schedule',
    id: 'anesthesiologist-kim-schedule',
    active: true,
    comment: 'Dr. James Kim (Anesthesiologist) - Bariatric Surgery',
    serviceType: [
      {
        coding: [{ system: 'http://snomed.info/sct', code: '287809009' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
        ],
      },
    ],
    actor: [
      {
        reference: 'Practitioner/anesthesiologist-kim',
        display: 'Dr. James Kim - Anesthesiologist',
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          {
            url: 'service',
            valueReference: { reference: 'HealthcareService/bariatric-surgery' },
          },
          {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'daysOfWeek', valueCode: 'tue' },
                  { url: 'daysOfWeek', valueCode: 'wed' },
                  { url: 'daysOfWeek', valueCode: 'thu' },
                  { url: 'daysOfWeek', valueCode: 'fri' },
                  { url: 'availableStartTime', valueTime: '07:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
// end-block anesthesiologistSchedule

// Canonical, validated seed bundle: one service (Surgical Procedure) bookable across
// multiple practitioners and rooms. Add more practitioners/rooms by duplicating the
// Practitioner/Location + Schedule pair below.
//
// NOTE: the service code below uses a placeholder `http://example.org/appointment-types`
// system. Replace it with a real SNOMED CT / CPT code before using in production.
const seedBundle: Bundle =
  // start-block seedBundle
  {
    resourceType: 'Bundle',
    // type: transaction so a bad entry rolls back instead of silently partial-committing
    type: 'transaction',
    entry: [
      {
        fullUrl: 'urn:uuid:0000-org',
        resource: {
          resourceType: 'Organization',
          name: 'Bayview Surgery Center',
          identifier: [{ system: 'http://example.org/organizations', value: 'bayview-surgery-center' }],
        },
        request: {
          method: 'POST',
          url: 'Organization',
          // ifNoneExist makes re-running the seed idempotent (conditional create)
          ifNoneExist: 'identifier=http://example.org/organizations|bayview-surgery-center',
        },
      },
      {
        fullUrl: 'urn:uuid:0000-hs',
        resource: {
          resourceType: 'HealthcareService',
          providedBy: { reference: 'urn:uuid:0000-org', display: 'Bayview Surgery Center' },
          name: 'Surgical Procedure',
          type: [
            {
              text: 'Surgical Procedure',
              coding: [
                {
                  system: 'http://example.org/appointment-types',
                  code: 'surgical-procedure',
                  display: 'Surgical Procedure',
                },
              ],
            },
          ],
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
              // set duration / alignmentInterval / alignmentTimezone HERE; all schedules booked together must match on these
              extension: [
                {
                  url: 'duration',
                  valueDuration: { value: 120, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
                },
                {
                  url: 'bufferBefore',
                  valueDuration: { value: 30, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
                },
                {
                  url: 'bufferAfter',
                  valueDuration: { value: 30, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
                },
                {
                  url: 'alignmentInterval',
                  valueDuration: { value: 30, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
                },
                { url: 'alignmentTimezone', valueCode: 'America/Los_Angeles' },
              ],
            },
          ],
        },
        request: { method: 'POST', url: 'HealthcareService' },
      },
      {
        fullUrl: 'urn:uuid:0000-loc-or1',
        resource: {
          resourceType: 'Location',
          name: 'OR-1',
          mode: 'instance',
          // the actor must carry a timezone extension
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Los_Angeles' }],
        },
        request: { method: 'POST', url: 'Location' },
      },
      {
        fullUrl: 'urn:uuid:0000-pract-surgeon',
        resource: {
          resourceType: 'Practitioner',
          name: [{ given: ['Maria'], family: 'Martinez', prefix: ['Dr.'] }],
          // the actor must carry a timezone extension
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Los_Angeles' }],
        },
        request: { method: 'POST', url: 'Practitioner' },
      },
      {
        fullUrl: 'urn:uuid:0000-sched-surgeon',
        resource: {
          resourceType: 'Schedule',
          active: true,
          // Schedule has no 'name' field in R4 - use comment for a label
          comment: 'Dr. Martinez (Surgeon) - Surgical Procedure',
          actor: [{ reference: 'urn:uuid:0000-pract-surgeon', display: 'Dr. Maria Martinez' }],
          serviceType: [
            {
              text: 'Surgical Procedure',
              coding: [{ system: 'http://example.org/appointment-types', code: 'surgical-procedure' }],
              extension: [
                {
                  url: 'https://medplum.com/fhir/service-type-reference',
                  valueReference: { reference: 'urn:uuid:0000-hs', display: 'Surgical Procedure' },
                },
              ],
            },
          ],
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
              extension: [
                {
                  url: 'service',
                  valueReference: { reference: 'urn:uuid:0000-hs', display: 'Surgical Procedure' },
                },
                {
                  url: 'availability',
                  extension: [
                    {
                      url: 'availableTime',
                      extension: [
                        { url: 'daysOfWeek', valueCode: 'tue' },
                        { url: 'daysOfWeek', valueCode: 'thu' },
                        { url: 'availableStartTime', valueTime: '08:00:00' },
                        { url: 'availableEndTime', valueTime: '16:00:00' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        request: { method: 'POST', url: 'Schedule' },
      },
      {
        fullUrl: 'urn:uuid:0000-sched-or1',
        resource: {
          resourceType: 'Schedule',
          active: true,
          comment: 'OR-1 - Surgical Procedure',
          actor: [{ reference: 'urn:uuid:0000-loc-or1', display: 'OR-1' }],
          serviceType: [
            {
              text: 'Surgical Procedure',
              coding: [{ system: 'http://example.org/appointment-types', code: 'surgical-procedure' }],
              extension: [
                {
                  url: 'https://medplum.com/fhir/service-type-reference',
                  valueReference: { reference: 'urn:uuid:0000-hs', display: 'Surgical Procedure' },
                },
              ],
            },
          ],
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
              extension: [
                {
                  url: 'service',
                  valueReference: { reference: 'urn:uuid:0000-hs', display: 'Surgical Procedure' },
                },
                {
                  url: 'availability',
                  extension: [
                    {
                      url: 'availableTime',
                      extension: [
                        { url: 'daysOfWeek', valueCode: 'mon' },
                        { url: 'daysOfWeek', valueCode: 'tue' },
                        { url: 'daysOfWeek', valueCode: 'wed' },
                        { url: 'daysOfWeek', valueCode: 'thu' },
                        { url: 'daysOfWeek', valueCode: 'fri' },
                        { url: 'availableStartTime', valueTime: '07:00:00' },
                        { url: 'availableEndTime', valueTime: '19:00:00' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        request: { method: 'POST', url: 'Schedule' },
      },
    ],
  };
// end-block seedBundle

console.log(
  schedulingParamsHealthcareService,
  schedulingParamsSchedule,
  scheduleResource,
  scheduleAvailability,
  healthcareServiceServiceLevel,
  scheduleServiceTypeLink,
  scheduleOverride,
  slotBlocking,
  actorTimezone,
  multiTimezoneSchedule,
  officeVisitService,
  drJohnsonSchedule,
  newPatientService,
  followUpService,
  multiServiceSchedule,
  bariatricService,
  surgeonSchedule,
  operatingRoomSchedule,
  anesthesiologistSchedule,
  seedBundle
);
