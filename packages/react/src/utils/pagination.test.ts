// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getPaginationControlProps } from './pagination';

describe('Pagination utils', () => {
  test('getPaginationControlProps', () => {
    expect(getPaginationControlProps('next')).toStrictEqual({ 'aria-label': 'Next page' });
    expect(getPaginationControlProps('previous')).toStrictEqual({ 'aria-label': 'Previous page' });
    expect(getPaginationControlProps('first')).toStrictEqual({ 'aria-label': 'First page' });
    expect(getPaginationControlProps('last')).toStrictEqual({ 'aria-label': 'Last page' });
    expect(getPaginationControlProps('unknown')).toStrictEqual({});
  });
});
