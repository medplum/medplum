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
import { badRequest, OperationOutcomeError } from './outcomes';
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
 *
 * Unscoped: on a Schedule, where the extension repeats once per service, this reports that some
 * service is configured rather than any particular one. Ask `getScheduleParameters` about a service.
 * @param resource - Schedule or HealthcareService to inspect
 * @returns True if the resource has a SchedulingParameters extension
 */
export function hasSchedulingParameters(resource: Schedule | HealthcareService): boolean {
  return !!getExtension(resource, SchedulingParametersURI);
}

// Scheduling matches a `service` reference on resourceType and id, so a stored reference carrying a version
// suffix still names the service. Match the same way: a reference the server honours but this module missed
// would read as belonging to another service, and `setScheduleParameter` would then add a second
// SchedulingParameters extension for it, which the scheduling operations reject outright.
function isServiceReference(reference: Reference | undefined, serviceReference: string): boolean {
  if (!reference?.reference) {
    return false;
  }
  const [resourceType, id] = reference.reference.split('/');
  return `${resourceType}/${id}` === serviceReference;
}

function matchesServiceSchedulingParameters(extension: Extension, serviceReference: string): boolean {
  return (
    extension.url === SchedulingParametersURI &&
    (extension.extension?.some(
      (subextension) =>
        subextension.url === 'service' && isServiceReference(subextension.valueReference, serviceReference)
    ) ??
      false)
  );
}

/**
 * Finds the SchedulingParameters extensions a Schedule carries for a HealthcareService.
 *
 * Kept internal, since `getScheduleParameters` and its write pair reach a parameter without exposing
 * how SchedulingParameters nests. More than one extension can match, and matching is expected to widen
 * further, so every caller here treats the result as a list rather than a single container.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService referenced by the desired parameters
 * @returns Every matching SchedulingParameters extension, in document order
 */
function getScheduleParameterExtensions(schedule: Schedule, service: WithId<HealthcareService>): Extension[] {
  const reference = getReferenceString(service);
  return schedule.extension?.filter((extension) => matchesServiceSchedulingParameters(extension, reference)) ?? [];
}

/**
 * Reads one scheduling parameter a Schedule sets for a HealthcareService, taking precedence over the
 * service-level parameter of the same name. Pairs with `setScheduleParameter` and `clearScheduleParameter`.
 *
 * The result is a list rather than a single extension because a Schedule may carry more than one
 * SchedulingParameters extension matching the service, and because a parameter may legitimately repeat.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService referenced by the parameters
 * @param url - Url of the SchedulingParameters sub-extension to read, for example `availability`
 * @returns Every matching sub-extension, in document order
 */
export function getScheduleParameters(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  url: string
): Extension[] {
  return getScheduleParameterExtensions(schedule, service).flatMap((parameters) => getExtensions(parameters, url));
}

// Convert a single `SchedulingParameters.availability.availableTime`
// sub-sub-extension into a HealthcareServiceAvailableTime.
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

// The hours a Schedule sets for a service, ignoring the service default, or undefined when it sets
// none. Kept internal: `resolveAvailability` answers what is in effect and `hasScheduleAvailability`
// answers whether the calendar has hours of its own, which covers both questions a caller has.
function getScheduleAvailability(
  schedule: Schedule,
  service: WithId<HealthcareService>
): HealthcareServiceAvailableTime[] | undefined {
  const availability = getScheduleParameters(schedule, service, 'availability');

  if (!availability.length) {
    return undefined;
  }

  return availability.flatMap((extension) => getExtensions(extension, 'availableTime')).map(toAvailableTime);
}

/**
 * Resolves the availability in effect for a HealthcareService, on a given calendar or on its own.
 * Hours the Schedule sets for the service take precedence over the service default.
 *
 * Three states are worth telling apart. A Schedule that sets no availability inherits
 * `HealthcareService.availableTime`. One that sets an empty availability means explicitly no hours,
 * which is why that is returned rather than falling through, and also why it cannot be stored: an
 * extension with neither a value nor sub-extensions fails FHIR constraint `ext-1`, so
 * `setScheduleAvailability` refuses to write one. `undefined` means nothing is configured at either
 * level, which scheduling reads as unconstrained rather than unavailable.
 *
 * Omitting the Schedule returns `service.availableTime` and nothing more, so this is not the way to read
 * a service default; the field is. The Schedule is optional so that one call covers a caller that may or
 * may not have one.
 * @param service - HealthcareService providing the default availability
 * @param schedule - Schedule that may set hours of its own for the service
 * @returns The availability in effect, or undefined when none is configured
 */
export function resolveAvailability(
  service: WithId<HealthcareService> | undefined,
  schedule?: Schedule
): HealthcareServiceAvailableTime[] | undefined {
  if (!service) {
    return undefined;
  }

  return (schedule && getScheduleAvailability(schedule, service)) ?? service.availableTime;
}

/**
 * Returns whether a Schedule sets availability of its own for a HealthcareService, in place of the
 * service default. Distinguishes the two cases `resolveAvailability` folds together.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService referenced by the desired parameters
 * @returns True if the Schedule sets availability for the service
 */
export function hasScheduleAvailability(schedule: Schedule, service: WithId<HealthcareService>): boolean {
  return getScheduleParameters(schedule, service, 'availability').length > 0;
}

// One `availability.availableTime` sub-sub-extension. `HealthcareServiceAvailableTime` allows an entry
// with neither `allDay` nor a pair of times, which has no representation here: the sub-extensions would
// carry no value and no children of their own, failing ext-1. Nor is dropping them an option, since the
// scheduling operations read an availableTime with no times at all as no entry, so the hours would go
// missing on read rather than fail on write.
function buildAvailableTimeExtension(entry: HealthcareServiceAvailableTime): Extension {
  const days: Extension[] = (entry.daysOfWeek ?? []).map((day) => ({ url: 'daysOfWeek', valueCode: day }));

  if (entry.allDay) {
    return { url: 'availableTime', extension: [...days, { url: 'allDay', valueBoolean: true }] };
  }

  if (!entry.availableStartTime || !entry.availableEndTime) {
    throw new OperationOutcomeError(
      badRequest('availableTime must set allDay, or both availableStartTime and availableEndTime')
    );
  }

  return {
    url: 'availableTime',
    extension: [
      ...days,
      { url: 'availableStartTime', valueTime: entry.availableStartTime },
      { url: 'availableEndTime', valueTime: entry.availableEndTime },
    ],
  };
}

/**
 * Builds the SchedulingParameters availability sub-extension.
 * @param availableTime - Availability to serialize. Must hold at least one entry, each of which sets
 * either `allDay` or both times.
 * @returns An availability extension containing availableTime entries
 */
function buildAvailabilityExtension(availableTime: HealthcareServiceAvailableTime[]): Extension {
  // No entries would serialize to `{ url: 'availability', extension: [] }`, an extension with neither a
  // value nor sub-extensions, which fails ext-1. Refused rather than treated as no override, because
  // "explicitly no hours" and "follow the service default" are the two states `resolveAvailability`
  // exists to tell apart, and storing one as the other means the opposite of what the caller asked for.
  if (!availableTime.length) {
    throw new OperationOutcomeError(
      badRequest('availability must have at least one availableTime; to follow the service default, clear it instead')
    );
  }

  return { url: 'availability', extension: availableTime.map(buildAvailableTimeExtension) };
}

/**
 * Immutably sets one scheduling parameter on a Schedule for a HealthcareService, so that calendar keeps
 * it in place of the service-level parameter of the same name. Whatever the Schedule already holds at the
 * sub-extension's url is replaced, and the SchedulingParameters extension is created if the Schedule has
 * none for the service yet.
 *
 * This is the general form, taking any sub-extension of the shape the parameter calls for, for example
 * `{ url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } }`. `setScheduleAvailability` is a
 * typed wrapper over it. Pairs with `clearScheduleParameter` and `getScheduleParameters`.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param subextension - SchedulingParameters sub-extension to set
 * @returns A cloned Schedule containing the parameter
 */
export function setScheduleParameter(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  subextension: Extension
): Schedule {
  // Start from a cleared clone so a Schedule carrying more than one matching
  // SchedulingParameters extension cannot keep a stale value behind.
  const updated = clearScheduleParameter(schedule, service, subextension.url);
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
 * Immutably clears one scheduling parameter a Schedule sets for a HealthcareService, dropping that
 * calendar back to the service-level parameter of the same name. Pairs with `setScheduleParameter`
 * and `getScheduleParameters`.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param url - Url of the SchedulingParameters sub-extension to remove, for example `availability`
 * @returns A cloned Schedule without the matching parameter
 */
export function clearScheduleParameter(schedule: Schedule, service: WithId<HealthcareService>, url: string): Schedule {
  const updated = deepClone(schedule);

  for (const parameters of getScheduleParameterExtensions(updated, service)) {
    if (parameters.extension) {
      parameters.extension = parameters.extension.filter((subextension) => subextension.url !== url);
    }
  }

  return updated;
}

/**
 * Immutably gives a Schedule its own hours for a HealthcareService, in place of the service default.
 * Pairs with `clearScheduleAvailability`, which drops back to the default, and `hasScheduleAvailability`,
 * which reports whether the calendar has hours of its own.
 *
 * Schedule level by necessity: a HealthcareService holds its hours in the native `availableTime` field
 * rather than in a scheduling parameter, so there is no service-level counterpart to this. Editing a
 * service default is a plain write to that field, and the parameter stores exactly the same shape.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param availableTime - The full set of windows the calendar should be available in. At least one entry, each
 * setting either `allDay` or both times, since anything else has no valid extension form.
 * @returns A cloned Schedule holding those hours for the service
 * @throws {@link OperationOutcomeError} If `availableTime` is empty, or an entry sets neither `allDay` nor both
 * times. To have the calendar follow the service default, call `clearScheduleAvailability` instead.
 */
export function setScheduleAvailability(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  availableTime: HealthcareServiceAvailableTime[]
): Schedule {
  return setScheduleParameter(schedule, service, buildAvailabilityExtension(availableTime));
}

/**
 * Immutably drops the hours a Schedule sets for a HealthcareService, so the calendar follows the
 * service default again.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @returns A cloned Schedule without availability for the service
 */
export function clearScheduleAvailability(schedule: Schedule, service: WithId<HealthcareService>): Schedule {
  return clearScheduleParameter(schedule, service, 'availability');
}

/**
 * Resolves the timezone used by scheduling in server priority order: the Schedule's parameters for the
 * service, then the service's own parameters, then the actor's standard FHIR timezone extension.
 *
 * Precedence is per parameter rather than per resource, so a Schedule that sets other parameters but no
 * timezone still falls through to the service.
 * @param service - HealthcareService whose parameters may define a timezone
 * @param schedule - Schedule whose parameters may define a timezone. Omit to resolve the service's own timezone,
 * as when the service default hours are being read on their own rather than through a particular calendar.
 * @param actor - Optional Schedule actor used as a timezone fallback
 * @returns The resolved IANA timezone identifier, if present
 */
export function getSchedulingTimezone(
  service: WithId<HealthcareService>,
  schedule?: Schedule,
  actor?: Resource
): string | undefined {
  const scheduleTimezone = (schedule ? getScheduleParameters(schedule, service, 'timezone') : [])
    .map((subextension) => subextension.valueCode)
    .find(isDefined);
  if (scheduleTimezone) {
    return scheduleTimezone;
  }

  // A HealthcareService's parameters are about itself, so there is no service reference to match on.
  const serviceTimezone = getExtensions(service, [SchedulingParametersURI, 'timezone'])
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
