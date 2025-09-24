// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { Project } from '@medplum/fhirtypes';

/**
 * The hardcoded ID for the base FHIR R4 Project.
 *
 * This is a UUIDv5 of the string "R4" in the nil UUID namespace.
 *
 *     r4ProjectId = v5('R4', nullUuid)
 */
export const r4ProjectId = '161452d9-43b7-5c29-aa7b-c85680fa45c6';

export const syntheticR4Project: WithId<Project> = {
  resourceType: 'Project',
  id: r4ProjectId,
  name: 'FHIR R4',
  exportedResourceType: ['StructureDefinition', 'ValueSet', 'CodeSystem', 'SearchParameter'],
};

/**
 * The hardcoded ID used in `projectId` columns in the database for system resources,
 * that is, resources that are not associated with a specific project.
 *
 * This is a UUIDv5 of the string "systemResource" in the nil UUID namespace.
 *
 *     systemResourceProjectId = v5('systemResource', nullUuid)
 */
export const systemResourceProjectId = '65897e4f-7add-55f3-9b17-035b5a4e6d52';
