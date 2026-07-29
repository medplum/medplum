// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { addressToString, applyFromDisplayName } from './utils';

describe('Email utils', () => {
  test('addressToString', () => {
    expect(addressToString(undefined)).toBeUndefined();
    expect(addressToString('foo@example.com')).toBe('foo@example.com');
    expect(addressToString({ name: 'name', address: 'foo@example.com' })).toBe('foo@example.com');
    expect(addressToString(['foo@example.com'])).toBe('foo@example.com');
    expect(addressToString([{ name: 'name', address: 'foo@example.com' }])).toBe('foo@example.com');
  });

  test('applyFromDisplayName', () => {
    expect(applyFromDisplayName('noreply@acme.com', 'Acme Health')).toStrictEqual({
      name: 'Acme Health',
      address: 'noreply@acme.com',
    });
    // Without a brand name, the address is used as-is.
    expect(applyFromDisplayName('noreply@acme.com', undefined)).toBe('noreply@acme.com');
    // A display name already set on the address wins over the brand name.
    expect(applyFromDisplayName('"Acme Billing" <noreply@acme.com>', 'Acme Health')).toBe(
      '"Acme Billing" <noreply@acme.com>'
    );
  });
});
