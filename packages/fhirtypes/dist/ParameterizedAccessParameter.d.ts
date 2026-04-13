// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Reference } from './Reference.d.ts';

/**
 * A named parameter value for a parameterized access policy.
 */
export interface ParameterizedAccessParameter {

  /**
   * The unique name of the parameter.
   */
  name: string;

  /**
   * Value of the parameter - must be one of a constrained set of the data
   * types (see [Extensibility](extensibility.html) for a list).
   */
  valueString?: string;

  /**
   * Value of the parameter - must be one of a constrained set of the data
   * types (see [Extensibility](extensibility.html) for a list).
   */
  valueReference?: Reference;
}

/**
 * Value of the parameter - must be one of a constrained set of the data
 * types (see [Extensibility](extensibility.html) for a list).
 */
export type ParameterizedAccessParameterValue = Reference | string;
