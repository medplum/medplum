// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { sortStringArray } from '@medplum/core';

export function getAvailableTables(resourceTypes: string[]): string[] {
  let tables: string[] = [];
  for (const resourceType of resourceTypes) {
    tables.push(resourceType);
    tables.push(resourceType + '_History');
    tables.push(resourceType + '_References');
  }
  tables.push('Address');
  tables.push('ContactPoint');
  tables.push('HumanName');
  tables.push('Coding');
  tables.push('Coding_Property');
  tables.push('DatabaseMigration');
  tables = sortStringArray(tables);
  return tables;
}

export function formatValue(val: boolean | string | number | undefined): string | number | undefined {
  if (typeof val === 'string') {
    return val.length > 50 ? val.substring(0, 50) + '...' : val;
  } else if (typeof val === 'boolean') {
    // boolean false values aren't rendered by React, so just stringify them
    return val.toString().toLocaleUpperCase();
  }

  return val;
}
