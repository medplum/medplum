// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { AccessPolicy } from './AccessPolicy.d.ts';
import type { ParameterizedAccessParameter } from './ParameterizedAccessParameter.d.ts';
import type { Reference } from './Reference.d.ts';

/**
 * Extended access configuration using a parameterized access policy.
 */
export interface ParameterizedAccess {

  /**
   * The base access policy used as a template.  Variables in the template
   * access policy are replaced by the values in the parameter.
   */
  policy: Reference<AccessPolicy>;

  /**
   * Named parameter values substituted into the policy template.
   */
  parameter?: ParameterizedAccessParameter[];
}
