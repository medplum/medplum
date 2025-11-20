// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtension, getExtensionValue } from '@medplum/core';
import type { CodeableConcept, Duration, Schedule, Timing } from '@medplum/fhirtypes';
import type { Repository } from '../../repo';

export interface SchedulingParams {
  availability?: Timing;
  bufferBefore?: Duration;
  bufferAfter?: Duration;
  alignmentInterval?: Duration;
  alignmentOffset?: Duration;
  bookingLimit?: Timing[];
  timingDuration?: Duration;
}

const SCHEDULING_PARAMETERS_URL = 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters';

/**
 * Loads scheduling parameters from a Schedule resource and optionally ActivityDefinition.
 * Priority order:
 * 1. Schedule with service-specific scheduling-parameters
 * 2. ActivityDefinition with matching service type
 * 3. Schedule with default (no serviceType) scheduling-parameters
 *
 * @param schedule - The Schedule resource
 * @param serviceType - Optional service type to filter by
 * @param repo - Repository for ActivityDefinition lookup
 * @returns Scheduling parameters object
 */
export async function loadSchedulingParameters(
  schedule: Schedule,
  serviceType: CodeableConcept | undefined,
  repo: Repository
): Promise<SchedulingParams> {
  const params: SchedulingParams = {};

  // Find scheduling-parameters extensions on Schedule
  const schedulingExtensions = schedule.extension?.filter((ext) => ext.url === SCHEDULING_PARAMETERS_URL) || [];

  // Look for service-specific extension first
  let selectedExtension = schedulingExtensions.find((ext) => {
    const serviceTypeExt = getExtension(ext, 'serviceType');
    if (!serviceTypeExt || !serviceType) {
      return false;
    }
    // Simple matching - in production would need proper CodeableConcept comparison
    return serviceTypeExt.valueCodeableConcept?.coding?.[0]?.code === serviceType.coding?.[0]?.code;
  });

  // Fall back to default extension (no serviceType)
  if (!selectedExtension) {
    selectedExtension = schedulingExtensions.find((ext) => {
      const serviceTypeExt = getExtension(ext, 'serviceType');
      return !serviceTypeExt;
    });
  }

  // Extract parameters from selected extension
  if (selectedExtension) {
    params.availability = getExtensionValue(selectedExtension, 'availability') as Timing | undefined;
    params.bufferBefore = getExtensionValue(selectedExtension, 'bufferBefore') as Duration | undefined;
    params.bufferAfter = getExtensionValue(selectedExtension, 'bufferAfter') as Duration | undefined;
    params.alignmentInterval = getExtensionValue(selectedExtension, 'alignmentInterval') as Duration | undefined;
    params.alignmentOffset = getExtensionValue(selectedExtension, 'alignmentOffset') as Duration | undefined;
    params.bookingLimit = getExtensionValue(selectedExtension, 'bookingLimit') as Timing[] | undefined;

    // bookingLimit can be multiple, so collect all
    const bookingLimitExts = selectedExtension.extension?.filter((ext) => ext.url === 'bookingLimit') || [];
    if (bookingLimitExts.length > 0) {
      params.bookingLimit = bookingLimitExts.map((ext) => ext.valueTiming).filter(Boolean) as Timing[];
    }
  }

  // TODO: Load from ActivityDefinition if serviceType provided and not found on Schedule
  // This will be implemented in Cycle 4.2

  return params;
}

