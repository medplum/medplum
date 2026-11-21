// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operator } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { addDefaultLabSearchValues, getLabResourceType } from './labSearch';

describe('labSearch utils', () => {
  test('completed tab defaults to DiagnosticReport, including preliminary and partial results', () => {
    expect(getLabResourceType('completed')).toBe('DiagnosticReport');

    const search = addDefaultLabSearchValues({ resourceType: 'DiagnosticReport' }, 'completed');

    const statusFilter = search.filters?.find((filter) => filter.code === 'status');
    expect(statusFilter?.value).toBe('final,corrected,amended,preliminary,partial');
  });

  test('open tab defaults to ServiceRequest with in-progress statuses', () => {
    expect(getLabResourceType('open')).toBe('ServiceRequest');

    const search = addDefaultLabSearchValues({ resourceType: 'ServiceRequest' }, 'open');

    const statusFilter = search.filters?.find((filter) => filter.code === 'status');
    expect(statusFilter?.value).toBe('active,draft,on-hold');
  });

  test('revoked tab defaults to ServiceRequest with revoked status', () => {
    expect(getLabResourceType('revoked')).toBe('ServiceRequest');

    const search = addDefaultLabSearchValues({ resourceType: 'ServiceRequest' }, 'revoked');

    const statusFilter = search.filters?.find((filter) => filter.code === 'status');
    expect(statusFilter?.value).toBe('revoked');
  });

  test('preserves an explicit status filter already present in the search', () => {
    const search = addDefaultLabSearchValues(
      {
        resourceType: 'DiagnosticReport',
        filters: [{ code: 'status', operator: Operator.EQUALS, value: 'final' }],
      },
      'completed'
    );

    const statusFilter = search.filters?.find((filter) => filter.code === 'status');
    expect(statusFilter?.value).toBe('final');
  });
});
