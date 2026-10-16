// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FetchLike, WithId } from '@medplum/core';
import { SchedulingParametersURI } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { useState } from 'react';
import type { Mock } from 'vitest';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import type { AvailabilityFieldsValue, AvailabilityMode } from './ScheduleAvailabilityEditor.utils';
import {
  getAvailabilityFieldsError,
  initialAvailabilityFieldsValue,
  toWeeklyAvailability,
} from './ScheduleAvailabilityEditor.utils';
import { ScheduleAvailabilityFields } from './ScheduleAvailabilityFields';

const service: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Follow-Up Visit',
  availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' }],
};

const scheduleWithOverride: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-1',
  actor: [{ reference: 'Practitioner/123' }],
  extension: [
    {
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        {
          url: 'availability',
          extension: [
            {
              url: 'availableTime',
              extension: [
                { url: 'daysOfWeek', valueCode: 'wed' },
                { url: 'availableStartTime', valueTime: '09:00:00' },
                { url: 'availableEndTime', valueTime: '17:00:00' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// Holds the value the way a parent form would, and shows the error it would block on.
function Harness(props: {
  readonly mode: AvailabilityMode;
  readonly initial: AvailabilityFieldsValue;
  readonly onChange: (value: AvailabilityFieldsValue) => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <>
      <ScheduleAvailabilityFields
        service={service}
        mode={props.mode}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange(next);
        }}
      />
      <output data-testid="error">{getAvailabilityFieldsError(value, service, props.mode)}</output>
    </>
  );
}

describe('ScheduleAvailabilityFields', () => {
  let fetch: Mock<FetchLike>;

  function setup(mode: AvailabilityMode, schedule?: Schedule): { onChange: ReturnType<typeof vi.fn> } {
    fetch = vi.fn<FetchLike>();
    const onChange = vi.fn();
    renderWithMedplum(
      <Harness mode={mode} initial={initialAvailabilityFieldsValue(service, schedule)} onChange={onChange} />,
      new MockClient({ fetch })
    );
    return { onChange };
  }

  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
  });

  test('editing a range reports the new week', async () => {
    const { onChange } = setup('service');

    await act(async () => {
      fireEvent.focus(screen.getByTestId('schedule-availability-end-mon-0'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('12:00 PM'));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next: AvailabilityFieldsValue = onChange.mock.calls[0][0];
    expect(next.overriding).toBe(true);
    expect(next.weekly.mon).toEqual({ available: true, ranges: [{ start: 8 * 60, end: 12 * 60 }] });
    expect(next.weekly.tue).toEqual({ available: true, ranges: [{ start: 8 * 60, end: 16 * 60 }] });
  });

  test('turning custom hours off puts the service default back in place', async () => {
    const { onChange } = setup('override', scheduleWithOverride);
    expect(screen.getByTestId('schedule-availability-start-wed-0')).toHaveValue('9:00 AM');

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-enable'));
    });

    expect(onChange).toHaveBeenCalledWith({
      overriding: false,
      weekly: toWeeklyAvailability(service.availableTime),
    });
    expect(screen.getByTestId('schedule-availability-start-mon-0')).toHaveValue('8:00 AM');
    expect(screen.queryByTestId('schedule-availability-start-wed-0')).toBeNull();
  });

  test('reports an emptied week as an error, in the words of its mode', async () => {
    setup('override', scheduleWithOverride);
    expect(screen.getByTestId('error')).toBeEmptyDOMElement();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-wed'));
    });

    expect(screen.getByTestId('error')).toHaveTextContent(
      'Custom availability must include at least one available day. ' +
        'To stop scheduling Follow-Up Visit on this calendar, turn it off in schedule settings.'
    );
  });

  test('reports an emptied service default as an error', async () => {
    setup('service');

    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-mon'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('schedule-availability-switch-tue'));
    });

    expect(screen.getByTestId('error')).toHaveTextContent(
      'Default availability must include at least one available day.'
    );
  });

  test('an empty week that follows the service default is no error', () => {
    fetch = vi.fn<FetchLike>();
    const empty = { overriding: false, weekly: toWeeklyAvailability(undefined) };
    expect(getAvailabilityFieldsError(empty, service, 'override')).toBeUndefined();
    expect(getAvailabilityFieldsError({ ...empty, overriding: true }, service, 'override')).toBeDefined();
  });

  test('shows no override switch or reset link for a service default', () => {
    setup('service');
    expect(screen.queryByTestId('schedule-availability-enable')).toBeNull();
    expect(screen.queryByTestId('schedule-availability-reset')).toBeNull();
  });
});
