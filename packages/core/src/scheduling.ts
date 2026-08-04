// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CodeableConcept,
  Extension,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Reference,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import type { WithId } from './utils';
import {
  createReference,
  deepClone,
  getExtension,
  getExtensions,
  getExtensionValue,
  getReferenceString,
  isDefined,
} from './utils';

export const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
export const SchedulingEncounterCodingURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingEncounterCoding';
export const SchedulingPlanDefinitionURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingPlanDefinition';

/**
 * Extension URI holding a `Reference<HealthcareService>` on a `serviceType` CodeableConcept.
 *
 * In R5/R6, `serviceType` attributes change from `CodeableConcept[]` to
 * `CodeableReference<HealthcareService>`. We approximate that in R4 with this extension.
 *
 * Example: a Schedule whose serviceType refers to a HealthcareService:
 * ```json
 * {
 *   "resourceType": "Schedule",
 *   "actor": [{ "reference": "Practitioner/abc" }],
 *   "serviceType": [
 *     {
 *       "extension": [
 *         {
 *           "url": "https://medplum.com/fhir/service-type-reference",
 *           "valueReference": { "reference": "HealthcareService/123" }
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
export const ServiceTypeReferenceURI = 'https://medplum.com/fhir/service-type-reference';
export const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';

export const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export function isDayOfWeek(value: string | undefined): value is DayOfWeek {
  return DAYS_OF_WEEK.includes(value as DayOfWeek);
}

/**
 * Returns whether a Schedule or HealthcareService has a SchedulingParameters extension.
 * @param resource - Schedule or HealthcareService to inspect
 * @returns True if the resource has a SchedulingParameters extension
 */
export function hasSchedulingParameters(resource: Schedule | HealthcareService): boolean {
  return !!getExtension(resource, SchedulingParametersURI);
}

function matchesServiceSchedulingParameters(extension: Extension, serviceReference: string): boolean {
  return (
    extension.url === SchedulingParametersURI &&
    (extension.extension?.some(
      (subextension) => subextension.url === 'service' && subextension.valueReference?.reference === serviceReference
    ) ??
      false)
  );
}

/**
 * Finds the SchedulingParameters extensions on a Schedule for a HealthcareService.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService referenced by the desired parameters
 * @returns Every matching SchedulingParameters extension, in document order
 */
function getServiceSchedulingParameters(schedule: Schedule, service: WithId<HealthcareService>): Extension[] {
  const reference = getReferenceString(service);
  return schedule.extension?.filter((extension) => matchesServiceSchedulingParameters(extension, reference)) ?? [];
}

// Convert a single `SchedulingParameters.availability.availableTime`
// sub-sub-extension into a HealthcareServiceAvailableTime. Note that
// `daysOfWeek` repeats once per day value rather than holding an array.
function toAvailableTime(availableTime: Extension): HealthcareServiceAvailableTime {
  const daysOfWeek = getExtensions(availableTime, 'daysOfWeek')
    .map((subextension) => subextension.valueCode)
    .filter(isDayOfWeek);

  if (getExtensions(availableTime, 'allDay')[0]?.valueBoolean) {
    return { daysOfWeek, allDay: true };
  }

  return {
    daysOfWeek,
    availableStartTime: getExtensions(availableTime, 'availableStartTime')[0]?.valueTime,
    availableEndTime: getExtensions(availableTime, 'availableEndTime')[0]?.valueTime,
  };
}

function getAvailabilityOverride(
  schedule: Schedule,
  service: WithId<HealthcareService>
): HealthcareServiceAvailableTime[] | undefined {
  const availability = getServiceSchedulingParameters(schedule, service).flatMap((parameters) =>
    getExtensions(parameters, 'availability')
  );

  if (!availability.length) {
    return undefined;
  }

  return availability.flatMap((extension) => getExtensions(extension, 'availableTime')).map(toAvailableTime);
}

/**
 * Resolves the availability in effect for a Schedule/HealthcareService pair.
 * A Schedule-level override wins over the service default when present.
 * @param schedule - Schedule that may override the service default
 * @param service - HealthcareService providing the default availability
 * @returns The availability in effect, or undefined when none is configured
 */
export function resolveAvailability(
  schedule: Schedule | undefined,
  service: WithId<HealthcareService> | undefined
): HealthcareServiceAvailableTime[] | undefined {
  if (!service) {
    return undefined;
  }

  const override = schedule && getAvailabilityOverride(schedule, service);
  return override ?? service.availableTime;
}

/**
 * Returns whether a Schedule overrides a HealthcareService's default availability.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService referenced by the desired parameters
 * @returns True if matching parameters contain an availability override
 */
export function hasAvailabilityOverride(schedule: Schedule, service: WithId<HealthcareService>): boolean {
  return getServiceSchedulingParameters(schedule, service).some((parameters) =>
    parameters.extension?.some((subextension) => subextension.url === 'availability')
  );
}

/**
 * Builds the SchedulingParameters availability sub-extension.
 * @param availableTime - Availability to serialize
 * @returns An availability extension containing availableTime entries
 */
function buildAvailabilityExtension(availableTime: HealthcareServiceAvailableTime[]): Extension {
  return {
    url: 'availability',
    extension: availableTime.map((entry) => {
      const days: Extension[] = (entry.daysOfWeek ?? []).map((day) => ({ url: 'daysOfWeek', valueCode: day }));
      if (entry.allDay) {
        return { url: 'availableTime', extension: [...days, { url: 'allDay', valueBoolean: true }] };
      }
      return {
        url: 'availableTime',
        extension: [
          ...days,
          { url: 'availableStartTime', valueTime: entry.availableStartTime },
          { url: 'availableEndTime', valueTime: entry.availableEndTime },
        ],
      };
    }),
  };
}

/**
 * Immutably sets one SchedulingParameters parameter on a Schedule for a HealthcareService, replacing
 * whatever that Schedule already holds at the sub-extension's url. The SchedulingParameters extension
 * is created if the Schedule has none for the service yet.
 *
 * Kept internal: availability is the only parameter this module writes today, through
 * `setAvailabilityOverride`. Export it when a second parameter needs setting, for example
 * `{ url: 'bufferBefore', valueDuration: ... }`.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param subextension - SchedulingParameters sub-extension to set
 * @returns A cloned Schedule containing the parameter
 */
function setSchedulingParameter(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  subextension: Extension
): Schedule {
  // Start from a cleared clone so a Schedule carrying more than one matching
  // SchedulingParameters extension cannot keep a stale override behind.
  const updated = clearSchedulingParameter(schedule, service, subextension.url);
  const serviceReference = createReference(service);

  updated.extension ??= [];

  let parameters = updated.extension.find((extension) =>
    matchesServiceSchedulingParameters(extension, serviceReference.reference)
  );

  if (!parameters) {
    parameters = {
      url: SchedulingParametersURI,
      extension: [{ url: 'service', valueReference: serviceReference }],
    };
    updated.extension.push(parameters);
  }

  parameters.extension = [...(parameters.extension ?? []), subextension];

  return updated;
}

/**
 * Immutably clears one SchedulingParameters parameter a Schedule holds for a HealthcareService.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param url - Url of the SchedulingParameters sub-extension to remove, for example `availability`
 * @returns A cloned Schedule without the matching parameter
 */
function clearSchedulingParameter(schedule: Schedule, service: WithId<HealthcareService>, url: string): Schedule {
  const updated = deepClone(schedule);

  for (const parameters of getServiceSchedulingParameters(updated, service)) {
    if (parameters.extension) {
      parameters.extension = parameters.extension.filter((subextension) => subextension.url !== url);
    }
  }

  return updated;
}

/**
 * Immutably sets a Schedule's availability override for a HealthcareService, so that calendar keeps
 * these hours in place of the service default. Pairs with `clearAvailabilityOverride`, which drops
 * back to the default, and `hasAvailabilityOverride`, which reports whether one is set.
 *
 * To edit the service default itself, write `HealthcareService.availableTime` directly; the override
 * stores exactly that shape.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param availableTime - Availability the calendar should keep
 * @returns A cloned Schedule containing the availability override
 */
export function setAvailabilityOverride(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  availableTime: HealthcareServiceAvailableTime[]
): Schedule {
  return setSchedulingParameter(schedule, service, buildAvailabilityExtension(availableTime));
}

/**
 * Immutably clears a Schedule's availability override for a HealthcareService.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @returns A cloned Schedule without the matching availability override
 */
export function clearAvailabilityOverride(schedule: Schedule, service: WithId<HealthcareService>): Schedule {
  return clearSchedulingParameter(schedule, service, 'availability');
}

/**
 * Resolves the timezone used by scheduling in server priority order:
 * Schedule parameters, HealthcareService parameters, then the actor's standard
 * FHIR timezone extension.
 * @param schedule - Schedule whose parameters may define a timezone. Omit to resolve the service's own timezone,
 * as when the service default hours are being read on their own rather than through a particular calendar.
 * @param service - HealthcareService whose parameters may define a timezone
 * @param actor - Optional Schedule actor used as a timezone fallback
 * @returns The resolved IANA timezone identifier, if present
 */
export function getSchedulingTimezone(
  schedule: Schedule | undefined,
  service: WithId<HealthcareService>,
  actor?: Resource
): string | undefined {
  const scheduleTimezone = (schedule ? getServiceSchedulingParameters(schedule, service) : [])
    .flatMap((parameters) => getExtensions(parameters, 'timezone'))
    .map((subextension) => subextension.valueCode)
    .find(isDefined);
  if (scheduleTimezone) {
    return scheduleTimezone;
  }

  const serviceTimezone = getExtensions(getExtension(service, SchedulingParametersURI), 'timezone')
    .map((subextension) => subextension.valueCode)
    .find(isDefined);
  if (serviceTimezone) {
    return serviceTimezone;
  }

  const actorTimezone = actor && getExtensionValue(actor, TimezoneExtensionURI);
  return typeof actorTimezone === 'string' ? actorTimezone : undefined;
}

/**
 * Converts a HealthcareService into the CodeableConcept values used by
 * `Schedule.serviceType` and `Appointment.serviceType`, which encode an R4
 * approximation of `CodeableReference<HealthcareService>`.
 * @param service - HealthcareService to represent
 * @returns CodeableConcept values containing a reference to the service
 */
export function toServiceTypeCodeableConcepts(service: WithId<HealthcareService>): CodeableConcept[] {
  const extension = [{ url: ServiceTypeReferenceURI, valueReference: createReference(service) }];
  if (!service.type?.length) {
    return [{ extension }];
  }
  return service.type.map((concept) => ({
    ...concept,
    extension: [...(concept.extension ?? []), ...extension],
  }));
}

/**
 * Returns whether any serviceType concept refers to the given HealthcareService.
 * @param serviceType - CodeableConcept values to inspect
 * @param service - HealthcareService or reference to match
 * @returns True if any concept references the service
 */
export function serviceTypeIncludesService(
  serviceType: CodeableConcept[] | undefined,
  service: WithId<HealthcareService> | (Reference<HealthcareService> & { reference: string })
): boolean {
  if (!serviceType?.length) {
    return false;
  }
  const reference = getReferenceString(service);
  return serviceType.some((concept) => {
    const serviceReference = getExtensionValue(concept, ServiceTypeReferenceURI) as
      Reference<HealthcareService> | undefined;
    return serviceReference?.reference === reference;
  });
}

/**
 * Extracts HealthcareService references from serviceType concepts.
 * @param serviceType - CodeableConcept values to inspect
 * @returns HealthcareService references embedded in the concepts
 */
export function extractServiceTypeReferences(
  serviceType: CodeableConcept[] | undefined
): Reference<HealthcareService>[] {
  if (!serviceType?.length) {
    return [];
  }
  return serviceType
    .map((concept) => getExtensionValue(concept, ServiceTypeReferenceURI) as Reference<HealthcareService> | undefined)
    .filter(isDefined);
}
