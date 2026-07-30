// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project } from '@medplum/fhirtypes';
import { addressToString, applyFromDisplayName, getProjectAppName } from './utils';

describe('Email utils', () => {
  function projectWithAppName(valueString: string | undefined): Project {
    if (valueString === undefined) {
      return { resourceType: 'Project' };
    }
    return { resourceType: 'Project', setting: [{ name: 'appName', valueString }] };
  }

  test('getProjectAppName returns undefined when unset', () => {
    expect(getProjectAppName(undefined)).toBeUndefined();
    expect(getProjectAppName(projectWithAppName(undefined))).toBeUndefined();
    expect(getProjectAppName({ resourceType: 'Project', setting: [] })).toBeUndefined();
  });

  test('getProjectAppName treats a blank app name as unset', () => {
    expect(getProjectAppName(projectWithAppName(''))).toBeUndefined();
    expect(getProjectAppName(projectWithAppName('   '))).toBeUndefined();
  });

  test('getProjectAppName returns the trimmed app name', () => {
    expect(getProjectAppName(projectWithAppName('Acme Health'))).toBe('Acme Health');
    expect(getProjectAppName(projectWithAppName('  Acme Health  '))).toBe('Acme Health');
  });

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
    // Without an app name, the address is used as-is.
    expect(applyFromDisplayName('noreply@acme.com', undefined)).toBe('noreply@acme.com');
    // A display name already set on the address wins over the app name.
    expect(applyFromDisplayName('"Acme Billing" <noreply@acme.com>', 'Acme Health')).toBe(
      '"Acme Billing" <noreply@acme.com>'
    );
  });
});
