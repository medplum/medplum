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
