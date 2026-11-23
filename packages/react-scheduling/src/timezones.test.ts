// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatTimezoneLabel, formatZonedTime, isSupportedTimezone, isViewerTimezone } from './timezones';

const EASTERN = 'America/New_York';
const PACIFIC = 'America/Los_Angeles';
const ARIZONA = 'America/Phoenix';

describe('isSupportedTimezone', () => {
  test('Accepts an alias and rejects a zone that does not exist', () => {
    expect(isSupportedTimezone('US/Pacific')).toBe(true);
    expect(isSupportedTimezone('Nowhere/Nothing')).toBe(false);
  });
});

describe('formatZonedTime', () => {
  const summer = new Date('2026-07-27T13:30:00.000Z');
  const winter = new Date('2026-01-27T14:30:00.000Z');

  test('Formats times in the requested zone', () => {
    const time = formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), EASTERN);
    expect(time).toContain('12:30');
    expect(formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), 'Etc/UTC')).toContain('4:30');
  });

  test('Names the zone only when asked to', () => {
    expect(formatZonedTime(summer, EASTERN)).toBe('9:30 AM');
    expect(formatZonedTime(summer, EASTERN, { withTimezone: true })).toBe('9:30 AM ET');
  });

  test('Names the zone the same way on either side of a daylight saving change', () => {
    // The generic name spares the reader "EDT" in July and "EST" in January for what they
    // think of as one zone.
    expect(formatZonedTime(winter, EASTERN, { withTimezone: true })).toBe('9:30 AM ET');
  });
});

describe('formatTimezoneLabel', () => {
  test('Writes the zone the short way', () => {
    expect(formatTimezoneLabel(EASTERN)).toBe('ET');
    expect(formatTimezoneLabel(PACIFIC)).toBe('PT');
  });

  test('Uses the standard abbreviation for a zone that never changes', () => {
    // Arizona keeps standard time all year, so there is nothing for a generic name to
    // generalise over and the abbreviation stands on its own.
    expect(formatTimezoneLabel(ARIZONA)).toBe('MST');
  });
});

describe('isViewerTimezone', () => {
  test('Answers against the viewer it is given', () => {
    expect(isViewerTimezone(EASTERN, EASTERN)).toBe(true);
    expect(isViewerTimezone(EASTERN, PACIFIC)).toBe(false);
  });

  test('Judges by identifier, not by the clock the zones happen to share', () => {
    // Arizona keeps standard time all year, so it reads the same as Pacific for half of it.
    // Naming the zone regardless keeps the rule one a reader can state.
    expect(isViewerTimezone(ARIZONA, PACIFIC)).toBe(false);
  });

  test("An unresolved zone is the viewer's own, since that is what gets displayed", () => {
    expect(isViewerTimezone(undefined, PACIFIC)).toBe(true);
  });
});
