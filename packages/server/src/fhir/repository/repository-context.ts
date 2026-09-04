// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Project, Reference } from '@medplum/fhirtypes';
import type { ShardRouting } from '../sharding';

/**
 * The RepositoryContext interface defines standard metadata for repository actions.
 * In practice, there will be one Repository per HTTP request.
 * And the RepositoryContext represents the context of that request,
 * such as "who is the current user?" and "what is the current project?"
 */
export interface RepositoryContext {
  routing: ShardRouting;

  /**
   * The current author reference.
   * This should be a FHIR reference string (i.e., "resourceType/id").
   * Where resource type is ClientApplication, Patient, Practitioner, etc.
   * This value will be included in every resource as meta.author.
   */
  author: Reference;

  /**
   * Optional individual, device, or organization for whom the change was made.
   * This value will be included in every resource as meta.onBehalfOf.
   */
  onBehalfOf?: Reference;

  /**
   * The authenticating ClientApplication for the current login, when present.
   * This is the application that obtained the access token, which may differ
   * from the acting `author` (e.g. when using `X-Medplum-On-Behalf-Of`, or for
   * a SMART on FHIR app acting on behalf of a user). It is recorded as an
   * additional non-requestor `agent[]` participant on per-interaction AuditEvents
   * so the audit trail captures which client performed an action.
   * Absent on the pure `client_credentials` / system paths.
   */
  client?: Reference<ClientApplication>;

  remoteAddress?: string;

  /**
   * Projects that the Repository is allowed to access.
   * This should include the ID/UUID of the current project, but may also include other accessory Projects.
   * If this is undefined, the current user is a server user (e.g. Super Admin)
   * The usual case has two elements: the user's Project and the base R4 Project
   * The user's "primary" Project will be the first element in the array (i.e. projects[0])
   * This value will be included in every resource as meta.project.
   */
  projects?: WithId<Project>[];

  /** Current Project of the authenticated user, or none for the system repository. */
  currentProject?: WithId<Project>;

  /**
   * Optional compartment restriction.
   * If the compartments array is provided,
   * all queries will be restricted to those compartments.
   */
  accessPolicy?: AccessPolicy;

  /**
   * Optional flag for system administrators,
   * which grants system-level access.
   */
  superAdmin?: boolean;

  /**
   * Optional flag for project administrators,
   * which grants additional project-level access.
   */
  projectAdmin?: boolean;

  /**
   * Optional flag to validate resources in strict mode.
   * Strict mode validates resources against StructureDefinition resources,
   * which includes strict date validation, backbone elements, and more.
   * Non-strict mode uses the official FHIR JSONSchema definition, which is
   * significantly more relaxed.
   */
  strictMode?: boolean;

  /**
   * Optional flag to validate references on write operations.
   * If enabled, the repository will check that all references are valid,
   * and that the current user has access to the referenced resource.
   */
  checkReferencesOnWrite?: boolean;

  validateTerminology?: boolean;

  /**
   * Optional flag to include Medplum extended meta fields.
   * Medplum tracks additional metadata for each resource, such as:
   * 1) "author" - Reference to the last user who modified the resource.
   * 2) "project" - Reference to the project that owns the resource.
   * 3) "compartment" - References to all compartments the resource is in.
   */
  extendedMode?: boolean;

  /**
   * Optional flag to skip scheduling background jobs for writes.
   */
  skipBackgroundJobs?: boolean;
}
