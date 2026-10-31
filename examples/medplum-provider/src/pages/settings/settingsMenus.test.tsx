// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { getSettingsMenus, isSettingsPath } from './settingsMenus';

describe('settingsMenus', () => {
  test.each([
    ['/settings', true],
    ['/settings/account', true],
    ['/Settings/Billing', true],
    ['/settingsx', false],
    ['/Patient', false],
  ])('isSettingsPath(%s) is %s', (pathname, expected) => {
    expect(isSettingsPath(pathname)).toBe(expected);
  });

  test('starts with a link back to the app', () => {
    const menus = getSettingsMenus({ returnHref: '/Task?status=ready', hasBilling: false });
    expect(menus[0].links?.[0]).toMatchObject({ label: 'Back to app', href: '/Task?status=ready' });
  });

  test('shows Candid billing pages only when billing is enabled', () => {
    const labels = (hasBilling: boolean): string[] =>
      getSettingsMenus({ returnHref: '/', hasBilling })
        .find((m) => m.title === 'Billing')
        ?.links?.map((l) => l.label ?? '') ?? [];

    expect(labels(false)).toEqual(['Charge Items']);
    expect(labels(true)).toEqual(['Organizations', 'Practitioners', 'Payers', 'Eligibility', 'Charge Items']);
  });
});
