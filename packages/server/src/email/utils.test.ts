// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { addressToString } from './utils';

describe('Email utils', () => {
  test('addressToString', () => {
    expect(addressToString(undefined)).toBeUndefined();
    expect(addressToString('foo@example.com')).toBe('foo@example.com');
    expect(addressToString({ name: 'name', address: 'foo@example.com' })).toBe('foo@example.com');
    expect(addressToString(['foo@example.com'])).toBe('foo@example.com');
    expect(addressToString([{ name: 'name', address: 'foo@example.com' }])).toBe('foo@example.com');
  });
});
