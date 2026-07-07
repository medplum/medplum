// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { generateId, getExtension, getIdentifier, getReferenceString, isDefined, setIdentifier } from '@medplum/core';
import type {
  Extension,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Identifier,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import { isDayOfWeek } from '../types/scheduling';

export const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';
export const SchedulingEncounterCodingURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingEncounterCoding';
export const SchedulingPlanDefinitionURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingPlanDefinition';

export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, generateId(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },

  remove(resource: Resource & { identifier?: Identifier[] }) {
    resource.identifier = resource.identifier?.filter(
      (identifier) => identifier.system !== MedplumSchedulingTransientIdentifierURI
    );
  },
};

export function hasSchedulingParameters(resource: Schedule | HealthcareService): boolean {
  return !!getExtension(resource, SchedulingParametersURI);
}

// Convert a single `SchedulingParameters.availability.availableTime`
// sub-sub-extension into a HealthcareServiceAvailableTime.
function extractAvailableTime(availableTime: Extension): HealthcareServiceAvailableTime | undefined {
  // `daysOfWeek` repeats once per day value.
  const daysOfWeek = (availableTime.extension ?? [])
    .filter((e) => e.url === 'daysOfWeek')
    .map((e) => e.valueCode)
    .filter(isDefined)
    .filter(isDayOfWeek);

  if (getExtension(availableTime, 'allDay')?.valueBoolean) {
    return { daysOfWeek, allDay: true };
  }

  const availableStartTime = getExtension(availableTime, 'availableStartTime')?.valueTime;
  const availableEndTime = getExtension(availableTime, 'availableEndTime')?.valueTime;
  return { daysOfWeek, availableStartTime, availableEndTime };
}

// Filters to SchedulingParameter extensions on the Schedule that are
// associated with the given HealthcareService
function schedulingParametersForService(service: WithId<HealthcareService>, schedule: Schedule): Extension[] {
  const serviceRef = getReferenceString(service);
  return (schedule.extension ?? []).filter((extension) => {
    if (extension.url !== SchedulingParametersURI) {
      return false;
    }
    return (extension.extension ?? []).some((subExtension) => {
      return subExtension.url === 'service' && subExtension.valueReference?.reference === serviceRef;
    });
  });
}

// Gets nested "SchedulingParameters.availability" extensions related to the
// requested service, and converts them into entries matching the shape of
// HealthcareService.availableTime.
function availabilityOverrides(
  service: WithId<HealthcareService>,
  schedule: Schedule
): HealthcareServiceAvailableTime[] | undefined {
  const extensions = schedulingParametersForService(service, schedule);
  const subExtensions = extensions.flatMap((extension) =>
    (extension.extension ?? []).filter((subExtension) => subExtension.url === 'availability')
  );

  if (!subExtensions?.length) {
    return undefined;
  }

  // Each `availability` extension holds one or more `availableTime` sub-extensions.
  return subExtensions
    .flatMap((availabilityExt) => availabilityExt.extension ?? [])
    .filter((subExtension) => subExtension.url === 'availableTime')
    .map(extractAvailableTime)
    .filter(isDefined);
}

// Returns an array of HealthcareServiceAvailableTime entries for a
// HealthcareService/Schedule pair. Respects overrides in scheduling parameter
// extensions on the schedule.
export function extractAvailability(
  service: WithId<HealthcareService> | undefined,
  schedule: Schedule | undefined
): HealthcareServiceAvailableTime[] | undefined {
  if (!service) {
    return undefined;
  }

  if (schedule) {
    const overrides = availabilityOverrides(service, schedule);
    if (overrides !== undefined) {
      return overrides;
    }
  }

  return service.availableTime;
}
