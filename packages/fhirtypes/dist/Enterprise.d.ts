// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { CodeableConcept } from './CodeableConcept.d.ts';
import type { Extension } from './Extension.d.ts';
import type { Identifier } from './Identifier.d.ts';
import type { Meta } from './Meta.d.ts';
import type { Narrative } from './Narrative.d.ts';
import type { Organization } from './Organization.d.ts';
import type { Project } from './Project.d.ts';
import type { Reference } from './Reference.d.ts';
import type { Resource } from './Resource.d.ts';

/**
 * A group of Medplum projects managed as a single enterprise.
 */
export interface Enterprise {

  /**
   * This is a Enterprise resource
   */
  readonly resourceType: 'Enterprise';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The metadata about the resource. This is content that is maintained by
   * the infrastructure.
   */
  meta?: Meta;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed.
   */
  implicitRules?: string;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * A human-readable narrative that contains a summary of the resource.
   */
  text?: Narrative;

  /**
   * Resources that do not have an independent existence apart from the
   * resource that contains them.
   */
  contained?: Resource[];

  /**
   * Additional content defined by implementations.
   */
  extension?: Extension[];

  /**
   * Extensions that cannot be ignored.
   */
  modifierExtension?: Extension[];

  /**
   * Identifiers for the enterprise.
   */
  identifier?: Identifier[];

  /**
   * The name of the enterprise.
   */
  name: string;

  /**
   * Whether the enterprise is active or inactive.
   */
  status: 'active' | 'inactive';

  /**
   * The organization represented by the enterprise.
   */
  organization?: Reference<Organization>;

  /**
   * Codes used to classify the enterprise.
   */
  code?: CodeableConcept[];

  /**
   * Projects belonging to the enterprise and their deployment
   * environments.
   */
  project?: EnterpriseProject[];
}

/**
 * Projects belonging to the enterprise and their deployment
 * environments.
 */
export interface EnterpriseProject {

  /**
   * A project belonging to the enterprise.
   */
  project: Reference<Project>;

  /**
   * Whether the project is a production or non-production environment.
   */
  code: 'production' | 'non-production';
}
