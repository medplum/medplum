// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Appointment,
  CodeableConcept,
  Duration,
  Extension,
  HealthcareService,
  Location,
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

/** Code system for scheduling requirements, recorded on `HealthcareService.eligibility.code`. */
export const SCHEDULING_ELIGIBILITY_SYSTEM = 'https://medplum.com/fhir/CodeSystem/scheduling-eligibility';

/** The eligibility code marking a visit type that cannot be booked without procedure codes. */
export const REQUIRES_PROCEDURE_CODE = 'requires-procedure';

/** The eligibility code marking a visit type that cannot be booked without diagnosis codes. */
export const REQUIRES_DIAGNOSIS_CODE = 'requires-diagnosis';

/** The eligibility code marking a visit type that cannot be booked without confirming medical necessity. */
export const REQUIRES_MEDICAL_NECESSITY_CODE = 'requires-medical-necessity';

/** Every eligibility code naming something a booking must carry. */
export const SCHEDULING_REQUIREMENT_CODES = [
  REQUIRES_PROCEDURE_CODE,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
] as const;

export type SchedulingRequirement = (typeof SCHEDULING_REQUIREMENT_CODES)[number];

/**
 * Returns whether a code names a scheduling requirement.
 * @param value - The `Coding.code` to test, which a resource need not carry.
 * @returns True when it is one of the requirements a booking honours.
 */
export function isSchedulingRequirement(value: string | undefined): value is SchedulingRequirement {
  return SCHEDULING_REQUIREMENT_CODES.includes(value as SchedulingRequirement);
}

/** Extension on an Appointment recording that medical necessity was confirmed when it was booked. */
export const SchedulingMedicalNecessityURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingMedicalNecessity';

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
 * This extension marks an `Appointment` created without the scheduling rules being
 * applied: the time may be occupied or blocked, past the configured capacity, off the
 * configured start interval, or any length at all.
 *
 * Such an appointment is written through the FHIR CRUD API rather than `$book`, so
 * nothing else about it says that it was never checked. This records only that.
 */
export const SchedulingUnvalidatedBookingURI =
  'https://medplum.com/fhir/StructureDefinition/SchedulingUnvalidatedBooking';

/** Extension URI marking which `Appointment.supportingInformation` entry is the site. */
export const SchedulingSiteURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingSite';

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
 * On a Schedule the extension repeats once per service, so this reports only that some service is
 * configured; ask `getScheduleSchedulingParameters` about a particular one.
 * @param resource - Schedule or HealthcareService to inspect
 * @returns True if the resource has a SchedulingParameters extension
 */
export function hasSchedulingParameters(resource: Schedule | HealthcareService): boolean {
  return !!getExtension(resource, SchedulingParametersURI);
}

/**
 * Returns what a visit type must be given before it can be booked, from its
 * `HealthcareService.eligibility` codes.
 * @param service - The visit type being booked, if one has been chosen yet.
 * @returns The requirements it names, empty until a visit type is chosen or when it names none.
 */
export function getSchedulingRequirements(service: HealthcareService | undefined): Set<SchedulingRequirement> {
  const requirements = new Set<SchedulingRequirement>();
  for (const eligibility of service?.eligibility ?? []) {
    for (const coding of eligibility.code?.coding ?? []) {
      if (coding.system === SCHEDULING_ELIGIBILITY_SYSTEM && isSchedulingRequirement(coding.code)) {
        requirements.add(coding.code);
      }
    }
  }
  return requirements;
}

// Compare resourceType and id only, as the server does: a stored reference may carry a version suffix and
// still name the same service. If that reference failed to match, `setScheduleSchedulingParameter` would
// see no parameters for the service and append a second SchedulingParameters extension for it, which the
// scheduling operations reject outright.
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

// Internal, and loose where the exported wrappers are strict: `service` is undefined only when the
// resource is a HealthcareService carrying its own parameters. Keep this and the read/write helpers
// below unexported. Nothing here rejects `(schedule, undefined)` or `(service, service)`; both would
// quietly match the wrong extensions, and the current exported wrappers are what make them
// unrepresentable. The deprecated wrappers stay as loose as the signatures they preserve.
function getSchedulingParameterExtensions(
  resource: Schedule | HealthcareService,
  service: WithId<HealthcareService> | undefined
): Extension[] {
  if (!service) {
    return resource.extension?.filter((extension) => extension.url === SchedulingParametersURI) ?? [];
  }
  const reference = getReferenceString(service);
  return resource.extension?.filter((extension) => matchesServiceSchedulingParameters(extension, reference)) ?? [];
}

/**
 * The sub-extension urls a `SchedulingParameters` extension may carry, apart from the `service` pointer a
 * Schedule's parameters are matched by, which these helpers maintain rather than expose.
 */
export type SchedulingParameterUrl =
  | 'availability'
  | 'duration'
  | 'bufferBefore'
  | 'bufferAfter'
  | 'alignmentInterval'
  | 'alignmentOffset'
  | 'alignmentTimezone'
  | 'timezone'
  | 'slotCapacity';

/**
 * The sub-extension urls a HealthcareService's own `SchedulingParameters` may carry. `availability` is
 * excluded because scheduling reads a service's hours from `HealthcareService.availableTime` and rejects
 * the sub-extension outright.
 */
export type HealthcareServiceSchedulingParameterUrl = Exclude<SchedulingParameterUrl, 'availability'>;

/** A `SchedulingParameters` sub-extension a Schedule may carry. */
export type SchedulingParameterExtension = Extension & { url: SchedulingParameterUrl };

/** A `SchedulingParameters` sub-extension a HealthcareService may carry. */
export type HealthcareServiceSchedulingParameterExtension = Extension & {
  url: HealthcareServiceSchedulingParameterUrl;
};

/**
 * Reads one scheduling parameter a Schedule sets for a HealthcareService, which overrides the
 * service-level parameter of the same name.
 *
 * This is the raw sub-extension as stored. The server resolves what a calendar actually schedules by,
 * applying defaults and service-level inheritance, in its own `getScheduleSchedulingParameters`.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService the parameters are scoped to
 * @param url - Url of the SchedulingParameters sub-extension to read, for example `availability`
 * @returns Every matching sub-extension, in document order
 */
export function getScheduleSchedulingParameters(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  url: SchedulingParameterUrl
): Extension[] {
  return readParameter(schedule, service, url);
}

/**
 * Reads one scheduling parameter a HealthcareService sets for itself.
 *
 * This is the raw sub-extension as stored. The server resolves what the service actually schedules by,
 * applying defaults, in its own `getHealthcareServiceSchedulingParameters`.
 * @param service - HealthcareService to inspect
 * @param url - Url of the SchedulingParameters sub-extension to read, for example `duration`
 * @returns Every matching sub-extension, in document order
 */
export function getHealthcareServiceSchedulingParameters(
  service: HealthcareService,
  url: HealthcareServiceSchedulingParameterUrl
): Extension[] {
  return readParameter(service, undefined, url);
}

/**
 * Immutably sets one scheduling parameter a Schedule overrides for a HealthcareService, replacing whatever
 * that calendar already holds at the sub-extension's url.
 * @param schedule - Schedule to update
 * @param service - HealthcareService the parameters are scoped to
 * @param subextension - SchedulingParameters sub-extension to set
 * @returns A cloned Schedule containing the parameter
 */
export function setScheduleSchedulingParameter<T extends Schedule>(
  schedule: T,
  service: WithId<HealthcareService>,
  subextension: SchedulingParameterExtension
): T {
  return setParameter(schedule, service, subextension);
}

/**
 * Immutably sets one scheduling parameter on a HealthcareService, replacing whatever it already holds at
 * the sub-extension's url.
 * @param service - HealthcareService to update
 * @param subextension - SchedulingParameters sub-extension to set
 * @returns A cloned HealthcareService containing the parameter
 */
export function setHealthcareServiceSchedulingParameter<T extends HealthcareService>(
  service: T,
  subextension: HealthcareServiceSchedulingParameterExtension
): T {
  return setParameter(service, undefined, subextension);
}

/**
 * Immutably clears one scheduling parameter a Schedule overrides for a HealthcareService, dropping that
 * calendar back to the service-level parameter of the same name.
 * @param schedule - Schedule to update
 * @param service - HealthcareService the parameters are scoped to
 * @param url - Url of the SchedulingParameters sub-extension to remove, for example `availability`
 * @returns A cloned Schedule without the matching parameter
 */
export function clearScheduleSchedulingParameter<T extends Schedule>(
  schedule: T,
  service: WithId<HealthcareService>,
  url: SchedulingParameterUrl
): T {
  return clearParameter(schedule, service, url);
}

/**
 * Immutably clears one scheduling parameter a HealthcareService sets for itself, dropping it back to
 * whatever scheduling defaults that parameter to.
 * @param service - HealthcareService to update
 * @param url - Url of the SchedulingParameters sub-extension to remove, for example `duration`
 * @returns A cloned HealthcareService without the matching parameter
 */
export function clearHealthcareServiceSchedulingParameter<T extends HealthcareService>(
  service: T,
  url: HealthcareServiceSchedulingParameterUrl
): T {
  return clearParameter(service, undefined, url);
}

/**
 * Reads one scheduling parameter a Schedule sets for a HealthcareService.
 * @param schedule - Schedule to inspect
 * @param service - HealthcareService the parameters are scoped to
 * @param url - Url of the SchedulingParameters sub-extension to read, for example `availability`
 * @returns Every matching sub-extension, in document order
 * @deprecated Use getScheduleSchedulingParameters() instead.
 */
export function getScheduleParameters(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  url: string
): Extension[] {
  return readParameter(schedule, service, url);
}

/**
 * Immutably sets one scheduling parameter a Schedule overrides for a HealthcareService.
 * @param schedule - Schedule to update
 * @param service - HealthcareService the parameters are scoped to
 * @param subextension - SchedulingParameters sub-extension to set
 * @returns A cloned Schedule containing the parameter
 * @deprecated Use setScheduleSchedulingParameter() instead.
 */
export function setScheduleParameter(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  subextension: Extension
): Schedule {
  return setParameter(schedule, service, subextension);
}

/**
 * Immutably clears one scheduling parameter a Schedule overrides for a HealthcareService.
 * @param schedule - Schedule to update
 * @param service - HealthcareService the parameters are scoped to
 * @param url - Url of the SchedulingParameters sub-extension to remove, for example `availability`
 * @returns A cloned Schedule without the matching parameter
 * @deprecated Use clearScheduleSchedulingParameter() instead.
 */
export function clearScheduleParameter(schedule: Schedule, service: WithId<HealthcareService>, url: string): Schedule {
  return clearParameter(schedule, service, url);
}

function readParameter(
  resource: Schedule | HealthcareService,
  service: WithId<HealthcareService> | undefined,
  url: string
): Extension[] {
  return getSchedulingParameterExtensions(resource, service).flatMap((parameters) => getExtensions(parameters, url));
}

function setParameter<T extends Schedule | HealthcareService>(
  resource: T,
  service: WithId<HealthcareService> | undefined,
  subextension: Extension
): T {
  // Note where the value sits before clearing removes it, so that replacing one leaves the sub-extension
  // where it was rather than moving it to the end, which would show up as churn in the resource timeline.
  const previousIndex =
    getSchedulingParameterExtensions(resource, service)[0]?.extension?.findIndex(
      (existing) => existing.url === subextension.url
    ) ?? -1;

  // Clear first: a resource carrying more than one matching container would otherwise keep a stale value.
  const updated = clearParameter(resource, service, subextension.url);

  updated.extension ??= [];

  let parameters = getSchedulingParameterExtensions(updated, service)[0];

  if (!parameters) {
    parameters = service
      ? { url: SchedulingParametersURI, extension: [{ url: 'service', valueReference: createReference(service) }] }
      : { url: SchedulingParametersURI };
    updated.extension.push(parameters);
  }

  const subextensions = [...(parameters.extension ?? [])];
  subextensions.splice(previousIndex < 0 ? subextensions.length : previousIndex, 0, subextension);
  parameters.extension = subextensions;

  return updated;
}

function clearParameter<T extends Schedule | HealthcareService>(
  resource: T,
  service: WithId<HealthcareService> | undefined,
  url: string
): T {
  const updated = deepClone(resource);

  for (const parameters of getSchedulingParameterExtensions(updated, service)) {
    if (parameters.extension) {
      parameters.extension = parameters.extension.filter((subextension) => subextension.url !== url);
    }
  }

  if (!updated.extension) {
    return updated;
  }

  // An extension with neither a value nor sub-extensions violates FHIR `ext-1`.
  updated.extension = updated.extension.filter(
    (extension) => extension.url !== SchedulingParametersURI || !!extension.extension?.length
  );

  if (updated.extension.length === 0) {
    delete updated.extension;
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
  const scheduleTimezone = (schedule ? getScheduleSchedulingParameters(schedule, service, 'timezone') : [])
    .map((subextension) => subextension.valueCode)
    .find(isDefined);
  if (scheduleTimezone) {
    return scheduleTimezone;
  }

  const serviceTimezone = getHealthcareServiceSchedulingParameters(service, 'timezone')
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
 * Builds the `supportingInformation` entry recording the site an appointment is held at.
 *
 * A site and a room are both `Location`, so the site is recorded here rather than as a
 * participant: `Appointment.location` answers the room, and {@link getAppointmentSite}
 * the site. Anything writing an appointment outside the booking form should record the
 * site through this, so that it is identifiable among the other `supportingInformation`
 * entries.
 *
 * @param site - The site the appointment is held at.
 * @returns The reference, stamped with {@link SchedulingSiteURI}.
 */
export function toAppointmentSiteReference(site: WithId<Location>): Reference<Location> {
  return { ...createReference(site), extension: [{ url: SchedulingSiteURI, valueBoolean: true }] };
}

/**
 * Reads the site an appointment is held at.
 *
 * Finds the entry {@link toAppointmentSiteReference} stamped.
 *
 * @param appointment - The appointment to read.
 * @returns The site, or undefined for an appointment holding none.
 */
export function getAppointmentSite(appointment: Appointment): Reference<Location> | undefined {
  return appointment.supportingInformation?.find(
    (reference): reference is Reference<Location> =>
      reference.reference?.startsWith('Location/') === true &&
      getExtensionValue(reference, SchedulingSiteURI) === true
  );
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

/**
 * Converts minutes to a SchedulingParameters duration, the inverse of `schedulingDurationToMinutes`.
 * @param minutes - The length in minutes.
 * @returns A duration scheduling accepts.
 */
export function minutesToSchedulingDuration(minutes: number): Duration {
  return { value: minutes, unit: 'min' };
}
