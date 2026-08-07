// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CodeableConcept,
  Duration,
  Extension,
  HealthcareService,
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
export const SchedulingScheduleColorURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingColor';

/**
 * This extension is set on `Slot` resources created through scheduling APIs.
 * Its value is a positive integer recording the slotCapacity for the service
 * and schedule at the time the booking was created. Omitted when the
 * slotCapacity is `1`.
 *
 * @see https://www.medplum.com/docs/scheduling/defining-availability#overbooking
 */
export const SchedulingSlotCapacityURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingSlotCapacity';

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

/**
 * Immutably sets one scheduling parameter on a Schedule for a HealthcareService, so that calendar keeps
 * it in place of the service-level parameter of the same name. Whatever the Schedule already holds at the
 * sub-extension's url is replaced, and the SchedulingParameters extension is created if the Schedule has
 * none for the service yet.
 *
 * Untyped by design, taking any sub-extension of the shape the parameter calls for, for example
 * `{ url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } }`. A parameter whose value is a nested
 * structure rather than a single `value[x]` is worth a typed wrapper over this; `availability` has one in
 * `@medplum/react-scheduling`. Pairs with `clearScheduleParameter` and `getScheduleParameters`.
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
 * Resolves the timezone used by scheduling in server priority order: the Schedule's parameters for the
 * service, then the service's own parameters, then the actor's standard FHIR timezone extension.
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

/**
 * The duration units SchedulingParameters accepts, and what each is worth in
 * minutes.
 */
const MINUTES_PER_UNIT: Record<string, number | undefined> = {
  wk: 60 * 24 * 7,
  d: 60 * 24,
  h: 60,
  min: 1,
};

/**
 * Converts a SchedulingParameters duration to minutes.
 *
 * @param duration - The duration to convert.
 * @returns The length in minutes, or undefined when the duration has no value, a
 * negative value, or a unit scheduling does not accept.
 */
export function schedulingDurationToMinutes(duration: Duration | undefined): number | undefined {
  const value = duration?.value;
  if (value === undefined || value < 0) {
    return undefined;
  }
  const perUnit = duration?.unit === undefined ? undefined : MINUTES_PER_UNIT[duration.unit];
  return perUnit === undefined ? undefined : value * perUnit;
}
