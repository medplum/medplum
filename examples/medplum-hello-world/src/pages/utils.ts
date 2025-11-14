// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, MedplumClient, SearchRequest, SortRule } from '@medplum/core';
import { convertToTransactionBundle, DEFAULT_SEARCH_COUNT, formatSearchQuery } from '@medplum/core';
import type { Bundle, ResourceType, UserConfiguration } from '@medplum/fhirtypes';

export const RESOURCE_PROFILE_URLS: Partial<Record<ResourceType, string>> = {
  ServiceRequest: 'http://medplum.com/StructureDefinition/medplum-provider-lab-procedure-servicerequest',
  Device: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-implantable-device',
};