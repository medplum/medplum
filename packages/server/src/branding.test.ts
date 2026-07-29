// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import { getProjectAppName } from './branding';

describe('getProjectAppName', () => {
  function projectWithAppName(valueString: string | undefined): Project {
    if (valueString === undefined) {
      return { resourceType: 'Project' };
    }
    return { resourceType: 'Project', setting: [{ name: 'appName', valueString }] };
  }

  test('Returns undefined when unset', () => {
    expect(getProjectAppName(undefined)).toBeUndefined();
    expect(getProjectAppName(projectWithAppName(undefined))).toBeUndefined();
    expect(getProjectAppName({ resourceType: 'Project', setting: [] })).toBeUndefined();
  });

  test('Treats a blank app name as unset', () => {
    expect(getProjectAppName(projectWithAppName(''))).toBeUndefined();
    expect(getProjectAppName(projectWithAppName('   '))).toBeUndefined();
  });

  test('Returns the trimmed app name', () => {
    expect(getProjectAppName(projectWithAppName('Acme Health'))).toBe('Acme Health');
    expect(getProjectAppName(projectWithAppName('  Acme Health  '))).toBe('Acme Health');
  });
});
