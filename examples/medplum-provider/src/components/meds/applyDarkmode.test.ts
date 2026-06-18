// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { applyDarkmode } from './applyDarkmode';

describe('applyDarkmode', () => {
  test('appends darkmode=on for dark scheme', () => {
    expect(applyDarkmode('https://ssu.scriptsure.com/widgets/prescription/1/2?sessiontoken=tok', 'dark')).toBe(
      'https://ssu.scriptsure.com/widgets/prescription/1/2?sessiontoken=tok&darkmode=on'
    );
  });

  test('appends darkmode=off for light scheme', () => {
    expect(applyDarkmode('https://ssu.scriptsure.com/widgets/prescription/1/2?sessiontoken=tok', 'light')).toBe(
      'https://ssu.scriptsure.com/widgets/prescription/1/2?sessiontoken=tok&darkmode=off'
    );
  });

  test('overrides any existing darkmode value', () => {
    expect(applyDarkmode('https://ssu.scriptsure.com/widget?sessiontoken=tok&darkmode=off', 'dark')).toBe(
      'https://ssu.scriptsure.com/widget?sessiontoken=tok&darkmode=on'
    );
    expect(applyDarkmode('https://ssu.scriptsure.com/widget?sessiontoken=tok&darkmode=on', 'light')).toBe(
      'https://ssu.scriptsure.com/widget?sessiontoken=tok&darkmode=off'
    );
  });

  test('returns undefined input untouched', () => {
    expect(applyDarkmode(undefined, 'dark')).toBeUndefined();
  });

  test('returns empty string untouched', () => {
    expect(applyDarkmode('', 'dark')).toBe('');
  });

  test('returns unparseable URL untouched without throwing', () => {
    expect(applyDarkmode('not a url', 'dark')).toBe('not a url');
  });
});
