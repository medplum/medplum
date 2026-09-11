// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { badRequest, OperationOutcomeError, Operator } from '@medplum/core';

export function isPresenceOperator(
  filter: Filter
): filter is Filter & { operator: (typeof Operator)['MISSING' | 'PRESENT'] } {
  return filter.operator === Operator.MISSING || filter.operator === Operator.PRESENT;
}

/**
 * Returns true if a search parameter value must exist for a :missing or :present filter.
 * @param operator - Either Operator.MISSING or Operator.PRESENT.
 * @param value - Filter value.
 * @returns True if the search parameter value must exist.
 */
export function shouldSearchParameterExist(operator: (typeof Operator)['MISSING' | 'PRESENT'], value: string): boolean {
  if (operator === Operator.MISSING) {
    switch (value.toLowerCase()) {
      case 'true':
        return false;
      case 'false':
        return true;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':missing' must have a value of 'true' or 'false'"));
    }
  }

  switch (value.toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new OperationOutcomeError(badRequest("Search filter ':present' must have a value of 'true' or 'false'"));
  }
}
