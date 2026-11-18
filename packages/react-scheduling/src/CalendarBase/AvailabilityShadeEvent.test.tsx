// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DrAliceSmithSchedule, MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import type { AvailabilityShade } from '../availabilityShading';
import { renderWithMedplum, screen } from '../test-utils/render';
import { AvailabilityShadeEvent } from './AvailabilityShadeEvent';
import { AvailabilityShadeHoverContext } from './useAvailabilityShadeHover';

const service = { resourceType: 'HealthcareService', id: 'follow-up', name: 'Follow-up' } as const;

// Local times, as the tooltip words them in the viewer's zone.
const at = (hour: number): Date => new Date(2020, 4, 8, hour);

const shade: AvailabilityShade = {
  id: 'shade-1',
  start: at(9),
  end: at(17),
  kind: 'service',
  color: 'blue',
  left: 0,
  width: 1,
  details: [
    { schedule: DrAliceSmithSchedule, service, start: at(9), end: at(12), inherited: false },
    { schedule: DrAliceSmithSchedule, service, start: at(13), end: at(16), inherited: false },
    { schedule: DrAliceSmithSchedule, service, start: at(9), end: at(17), inherited: true },
  ],
};

describe('AvailabilityShadeEvent', () => {
  test('lists only what holds at the time under the pointer', async () => {
    renderWithMedplum(
      <AvailabilityShadeHoverContext.Provider value={{ id: shade.id, at: at(14).getTime() }}>
        <AvailabilityShadeEvent shade={shade} />
      </AvailabilityShadeHoverContext.Provider>,
      new MockClient()
    );

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('1:00 PM – 4:00 PM');
    expect(tooltip).toHaveTextContent('9:00 AM – 5:00 PM · Any facility · default hours');
    expect(tooltip).not.toHaveTextContent('9:00 AM – 12:00 PM');
  });
});
