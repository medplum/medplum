// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getScheduleSchedulingParameters,
  SchedulingParametersURI,
  setScheduleSchedulingParameter,
} from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  getHealthcareServiceSchedulingParameterValues,
  getScheduleSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../parameterValues';
import { buildSchedulableService, FullyConfiguredService, UnconfiguredService } from '../stories/scheduling';
import { fireEvent, render, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { SchedulingParametersEditor } from './SchedulingParametersEditor';
import {
  getBlockingErrors,
  getInheritedDefaults,
  getSchedulingParameterWarnings,
  getTimezoneOptions,
  getVisibleParameters,
  isSupportedTimezone,
  validateSchedulingParameters,
} from './SchedulingParametersEditor.utils';

function field(name: string): HTMLElement {
  return screen.getByTestId(`scheduling-parameters-${name}`);
}

function missingField(name: string): HTMLElement | null {
  return screen.queryByTestId(`scheduling-parameters-${name}`);
}

function setField(name: string, value: string): void {
  fireEvent.change(field(name), { target: { value } });
}

/**
 * Opens a time zone picker and chooses a zone. Typing first narrows the list, which matters once the field
 * holds a value: Mantine stops filtering when the search text already equals the selected option.
 * @param name - The parameter the field edits.
 * @param zone - The IANA identifier to pick.
 */
function pickTimezone(name: string, zone: string): void {
  fireEvent.focus(field(name));
  fireEvent.change(field(name), { target: { value: zone } });
  fireEvent.click(screen.getByText(zone));
}

function clearTimezone(label: string): void {
  fireEvent.click(screen.getByLabelText(`Clear ${label}`));
}

function saveButton(): HTMLElement {
  return screen.getByTestId('scheduling-parameters-save');
}

/**
 * Renders the editor and captures what it hands to onSave.
 * @param service - The visit type to edit.
 * @param onCancel - Passed through, to show or hide the cancel button.
 * @returns The resources handed to onSave, in order.
 */
function renderEditor(
  service: WithId<HealthcareService>,
  onCancel?: () => void
): { saved: WithId<HealthcareService>[] } {
  const saved: WithId<HealthcareService>[] = [];
  render(
    <SchedulingParametersEditor
      service={service}
      onSave={(updated) => {
        saved.push(updated);
      }}
      onCancel={onCancel}
    />
  );
  return { saved };
}

describe('SchedulingParametersEditor', () => {
  test('renders the stored parameters in minutes', () => {
    renderEditor(FullyConfiguredService);

    expect(field('duration')).toHaveValue('30 min');
    expect(field('bufferBefore')).toHaveValue('5 min');
    expect(field('bufferAfter')).toHaveValue('10 min');
    expect(field('slotCapacity')).toHaveValue('1');
  });

  test('reads a duration stored in hours as minutes', () => {
    const service = buildSchedulableService({
      id: 'hourly',
      name: 'Hourly Visit',
      category: 'Office visit',
      durationMinutes: 1,
      alignmentMinutes: 60,
    });
    const parameters = service.extension?.[0].extension as Extension[];
    parameters[0].valueDuration = { value: 2, unit: 'h' };

    renderEditor(service);

    expect(field('duration')).toHaveValue('120 min');
  });

  test('shows what an empty field falls back to rather than leaving it blank', () => {
    renderEditor(UnconfiguredService);

    expect(field('bufferBefore')).toHaveAttribute('placeholder', '0 (default)');
    expect(field('alignmentInterval')).toHaveAttribute('placeholder', '60 (default)');
    expect(field('slotCapacity')).toHaveAttribute('placeholder', '1 (default)');
    expect(field('duration')).toHaveAttribute('placeholder', 'Not set');
  });

  test('steps an empty minutes field from a multiple of five, even where the minimum is one', () => {
    renderEditor(UnconfiguredService);

    fireEvent.keyDown(field('duration'), { key: 'ArrowUp' });
    expect(field('duration')).toHaveValue('5 min');
    fireEvent.keyDown(field('duration'), { key: 'ArrowUp' });
    expect(field('duration')).toHaveValue('10 min');

    fireEvent.keyDown(field('bufferBefore'), { key: 'ArrowUp' });
    expect(field('bufferBefore')).toHaveValue('0 min');
  });

  test('editing one parameter leaves the others exactly as they were', () => {
    const { saved } = renderEditor(FullyConfiguredService);

    setField('bufferBefore', '15');
    fireEvent.click(saveButton());

    expect(getHealthcareServiceSchedulingParameterValues(saved[0])).toEqual({
      ...getHealthcareServiceSchedulingParameterValues(FullyConfiguredService),
      bufferBefore: 15,
    });
  });

  test('clearing every parameter drops the extension rather than leaving an empty one', () => {
    // Numeric parameters only: a Select is cleared by its own button rather than by typing.
    const service: WithId<HealthcareService> = {
      ...UnconfiguredService,
      extension: [
        { url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }] },
      ],
    };
    const { saved } = renderEditor(service);

    setField('duration', '');
    fireEvent.click(saveButton());

    expect(saved[0].extension).toBeUndefined();
  });

  test('blocks a save on an alignment interval longer than a day', async () => {
    renderEditor(FullyConfiguredService);

    setField('alignmentInterval', '1441');

    await waitFor(() => expect(saveButton()).toHaveAttribute('aria-disabled', 'true'));
    const reasonId = saveButton().getAttribute('aria-describedby') as string;
    expect(document.getElementById(reasonId)).toHaveTextContent('Fix the highlighted fields before saving.');
    expect(screen.getByText('Interval cannot be more than 1440 minutes (1 day).')).toBeInTheDocument();
  });

  test('allows an alignment interval of exactly a day', async () => {
    const { saved } = renderEditor(FullyConfiguredService);

    setField('alignmentInterval', '1440');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(getHealthcareServiceSchedulingParameterValues(saved[0]).alignmentInterval).toBe(1440);
  });

  test('refuses to save while a field is blocked', async () => {
    const { saved } = renderEditor(FullyConfiguredService);

    setField('slotCapacity', '0');
    await waitFor(() => expect(saveButton()).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(saveButton());

    expect(saved).toHaveLength(0);
  });

  test('a value already stored out of range does not lock the form', async () => {
    const service = buildSchedulableService({
      id: 'stored-bad',
      name: 'Stored Bad',
      category: 'Office visit',
      durationMinutes: 30,
      alignmentMinutes: 2000,
    });

    const { saved } = renderEditor(service);

    expect(saveButton()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
  });

  test('warns that capacity above one is defeated by buffers, and still saves', async () => {
    const { saved } = renderEditor(FullyConfiguredService);

    setField('slotCapacity', '2');

    await waitFor(() =>
      expect(screen.getByTestId('scheduling-parameters-warning-capacity-with-buffers')).toBeInTheDocument()
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saved).toHaveLength(1));
  });

  test('warns that a capacity change does not reach existing appointments', async () => {
    renderEditor(FullyConfiguredService);

    setField('slotCapacity', '3');

    await waitFor(() =>
      expect(screen.getByTestId('scheduling-parameters-warning-capacity-not-retroactive')).toBeInTheDocument()
    );
  });

  test('warns about an interval that does not divide into a day, and not about one that does', async () => {
    renderEditor(FullyConfiguredService);

    setField('alignmentInterval', '50');
    await waitFor(() =>
      expect(screen.getByTestId('scheduling-parameters-warning-alignment-uneven')).toBeInTheDocument()
    );

    setField('alignmentInterval', '60');
    await waitFor(() =>
      expect(screen.queryByTestId('scheduling-parameters-warning-alignment-uneven')).not.toBeInTheDocument()
    );
  });

  test('warns that a visit type with no duration is barely bookable, and still saves', async () => {
    const { saved } = renderEditor(FullyConfiguredService);

    setField('duration', '');

    await waitFor(() => expect(screen.getByTestId('scheduling-parameters-warning-no-duration')).toBeInTheDocument());
    fireEvent.click(saveButton());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(getHealthcareServiceSchedulingParameterValues(saved[0]).duration).toBeUndefined();
  });

  test('leaves active alone, since booking is not a scheduling parameter', async () => {
    const inactive: WithId<HealthcareService> = { ...FullyConfiguredService, active: false };
    const { saved } = renderEditor(inactive);

    expect(missingField('active')).toBeNull();
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].active).toBe(false);
  });

  interface StoredZones {
    timezone?: string;
    alignmentTimezone?: string;
  }

  describe('the time zone fields', () => {
    function withZones(zones: StoredZones): WithId<HealthcareService> {
      return {
        ...UnconfiguredService,
        extension: [
          {
            url: SchedulingParametersURI,
            extension: Object.entries(zones).map(([url, valueCode]) => ({ url, valueCode })),
          },
        ],
      };
    }

    test('are both absent when the visit type stores neither', () => {
      renderEditor(UnconfiguredService);

      expect(missingField('timezone')).toBeNull();
      expect(missingField('alignmentTimezone')).toBeNull();
    });

    test('are both absent when a stored sub-extension carries no zone, and it is dropped on save', async () => {
      const empty: WithId<HealthcareService> = {
        ...UnconfiguredService,
        extension: [{ url: SchedulingParametersURI, extension: [{ url: 'timezone' }] }],
      };
      const { saved } = renderEditor(empty);

      expect(missingField('timezone')).toBeNull();
      expect(missingField('alignmentTimezone')).toBeNull();

      fireEvent.click(saveButton());
      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0].extension).toBeUndefined();
    });

    const cases: [string, StoredZones][] = [
      ['only a time zone', { timezone: 'America/Chicago' }],
      ['only an alignment time zone', { alignmentTimezone: 'America/Chicago' }],
      ['both', { timezone: 'America/Chicago', alignmentTimezone: 'Europe/Berlin' }],
    ];

    test.each(cases)('are both shown when the visit type stores %s', (_case, zones) => {
      renderEditor(withZones(zones));

      for (const key of ['timezone', 'alignmentTimezone'] as const) {
        expect(field(key)).toHaveValue(zones[key] ?? '');
        // Mantine marks a Select read-only unless it is searchable, so this fails if the field stops
        // being a picker the user can type into.
        expect(field(key)).not.toHaveAttribute('readonly');
      }
    });

    test('a zone can be picked into the field left empty by the other', async () => {
      const { saved } = renderEditor(withZones({ alignmentTimezone: 'America/Chicago' }));

      pickTimezone('timezone', 'Europe/Berlin');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0])).toEqual({
        timezone: 'Europe/Berlin',
        alignmentTimezone: 'America/Chicago',
      });
    });

    test('a stored zone can be changed to another', async () => {
      const { saved } = renderEditor(withZones({ alignmentTimezone: 'America/Chicago' }));

      pickTimezone('alignmentTimezone', 'Europe/Berlin');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).alignmentTimezone).toBe('Europe/Berlin');
    });

    test('clearing one leaves the other stored', async () => {
      const zones = { timezone: 'America/Chicago', alignmentTimezone: 'Europe/Berlin' };
      const { saved } = renderEditor(withZones(zones));

      clearTimezone('time zone');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0])).toEqual({ alignmentTimezone: 'Europe/Berlin' });
    });

    test('picking an alignment time zone settles the daylight saving warning', async () => {
      const service: WithId<HealthcareService> = {
        ...UnconfiguredService,
        extension: [
          {
            url: SchedulingParametersURI,
            extension: [
              { url: 'alignmentInterval', valueDuration: { value: 90, unit: 'min' } },
              { url: 'timezone', valueCode: 'America/Chicago' },
            ],
          },
        ],
      };
      renderEditor(service);

      expect(screen.getByTestId('scheduling-parameters-warning-alignment-dst-shift')).toBeInTheDocument();

      pickTimezone('alignmentTimezone', 'America/New_York');

      await waitFor(() => expect(screen.queryByTestId('scheduling-parameters-warning-alignment-dst-shift')).toBeNull());
    });

    test('each placeholder names what takes effect while the field is empty', () => {
      renderEditor(withZones({ timezone: 'America/Chicago' }));

      expect(field('alignmentTimezone')).toHaveAttribute('placeholder', 'Etc/UTC (default)');
      expect(field('timezone')).toHaveAttribute('placeholder', 'Not set');
    });
  });

  describe('a time zone already stored on the visit type', () => {
    const service: WithId<HealthcareService> = {
      ...FullyConfiguredService,
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [
            ...(FullyConfiguredService.extension?.[0].extension ?? []),
            { url: 'timezone', valueCode: 'America/Chicago' },
          ],
        },
      ],
    };

    test('is shown in a picker that can be changed', () => {
      renderEditor(service);

      expect(field('timezone')).toHaveValue('America/Chicago');
      expect(field('timezone')).not.toHaveAttribute('readonly');
    });

    test('survives a save that changes something else', async () => {
      const { saved } = renderEditor(service);

      setField('bufferBefore', '15');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).timezone).toBe('America/Chicago');
    });

    test('can be cleared, and the field stays so another can be picked', async () => {
      const { saved } = renderEditor(service);

      clearTimezone('time zone');
      expect(field('timezone')).toHaveValue('');
      // Visibility is read from the resource as loaded, so clearing a zone must not pull the field out
      // from under the cursor.
      expect(field('timezone')).toBeInTheDocument();
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).timezone).toBeUndefined();
    });

    test('is shown even when this runtime does not recognize it, and does not block a save', async () => {
      const unknown: WithId<HealthcareService> = {
        ...UnconfiguredService,
        extension: [{ url: SchedulingParametersURI, extension: [{ url: 'timezone', valueCode: 'Mars/Olympus_Mons' }] }],
      };
      const { saved } = renderEditor(unknown);

      expect(field('timezone')).toHaveValue('Mars/Olympus_Mons');
      // Offered as an option too, which is what stops the next save rewriting it.
      fireEvent.focus(field('timezone'));
      expect(screen.getByText('Mars/Olympus_Mons')).toBeInTheDocument();
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
    });
  });

  test('the no-duration warning links its Duration back to the field', async () => {
    renderEditor(FullyConfiguredService);

    setField('duration', '');
    await waitFor(() => expect(screen.getByTestId('scheduling-parameters-warning-no-duration')).toBeInTheDocument());

    const link = screen.getByTestId('scheduling-parameters-warning-no-duration-focus');
    expect(link).toHaveTextContent('Duration');
    // The rest of the sentence stays plain text, so only the field name is a link.
    expect(screen.getByTestId('scheduling-parameters-warning-no-duration')).toHaveTextContent(
      'Duration is not set, so this visit type can only be booked on calendars that set their own duration for this service.'
    );

    fireEvent.click(link);
    expect(field('duration')).toHaveFocus();
  });

  test('a rejected save leaves the button usable rather than stuck pending', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('conflict'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SchedulingParametersEditor service={FullyConfiguredService} onSave={failing} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(failing).toHaveBeenCalled());
    await waitFor(() => expect(saveButton()).not.toHaveAttribute('data-loading'));
    consoleError.mockRestore();
  });

  test('hides the cancel button when there is nothing to cancel to', () => {
    renderEditor(FullyConfiguredService);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    screen.getByTestId('scheduling-parameters-save');
  });

  test('shows the cancel button when a handler is given', () => {
    const onCancel = vi.fn();
    renderEditor(FullyConfiguredService, onCancel);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });

  test('never writes to the server itself', async () => {
    const medplum = new MockClient();
    const updateResource = vi.spyOn(medplum, 'updateResource');
    const saved: WithId<HealthcareService>[] = [];
    renderWithMedplum(
      <SchedulingParametersEditor
        service={FullyConfiguredService}
        onSave={(updated) => {
          saved.push(updated);
        }}
      />,
      medplum
    );

    setField('bufferAfter', '20');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(updateResource).not.toHaveBeenCalled();
  });
});

describe('SchedulingParametersEditor on a draft service', () => {
  test('edits a service not yet created, and hands it back for the caller to create', async () => {
    const saved: HealthcareService[] = [];
    render(
      <SchedulingParametersEditor
        service={{ resourceType: 'HealthcareService', name: 'New Visit' }}
        onSave={(updated) => {
          saved.push(updated);
        }}
      />
    );

    setField('duration', '45');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].id).toBeUndefined();
    expect(getHealthcareServiceSchedulingParameterValues(saved[0])).toEqual({ duration: 45 });
  });
});

describe('SchedulingParametersEditor on a Schedule', () => {
  const service = FullyConfiguredService;
  const otherService = buildSchedulableService({
    id: 'other',
    name: 'Other Visit',
    category: 'Office visit',
    durationMinutes: 60,
    alignmentMinutes: 60,
  });
  const availability: Extension & { url: 'availability' } = {
    url: 'availability',
    extension: [{ url: 'availableTime', extension: [{ url: 'daysOfWeek', valueCode: 'mon' }] }],
  };
  const baseSchedule: Schedule = {
    resourceType: 'Schedule',
    id: 'calendar',
    actor: [{ reference: 'Practitioner/dr-rivera' }],
  };

  function scheduleWith(overrides: Parameters<typeof setScheduleSchedulingParameterValues>[2]): Schedule {
    return setScheduleSchedulingParameterValues(baseSchedule, service, overrides);
  }

  function renderScheduleEditor(
    schedule: Schedule,
    forService: WithId<HealthcareService> = service
  ): { saved: Schedule[] } {
    const saved: Schedule[] = [];
    render(
      <SchedulingParametersEditor
        schedule={schedule}
        service={forService}
        onSave={(updated) => {
          saved.push(updated);
        }}
      />
    );
    return { saved };
  }

  test('is seeded from the calendar override, not the service', () => {
    renderScheduleEditor(scheduleWith({ bufferBefore: 20 }));

    expect(field('bufferBefore')).toHaveValue('20 min');
    expect(field('bufferAfter')).toHaveValue('');
  });

  test('each placeholder names the service it inherits from, or the default where the service sets none', () => {
    renderScheduleEditor(scheduleWith({}));

    expect(field('bufferAfter')).toHaveAttribute('placeholder', `10 (${service.name})`);
    expect(field('timezone')).toHaveAttribute('placeholder', 'Not set');
  });

  test('offers buffers, capacity and time zone, and leaves the grid to the service', () => {
    renderScheduleEditor(scheduleWith({}));

    for (const key of ['bufferBefore', 'bufferAfter', 'slotCapacity', 'timezone']) {
      expect(field(key)).toBeInTheDocument();
    }
    for (const key of ['duration', 'alignmentInterval', 'alignmentOffset', 'alignmentTimezone']) {
      expect(missingField(key)).toBeNull();
    }
    expect(screen.queryByText('Start times')).toBeNull();
  });

  test('shows a discouraged field the calendar already overrides, so it can be cleared', async () => {
    const { saved } = renderScheduleEditor(scheduleWith({ alignmentInterval: 15 }));

    expect(field('alignmentInterval')).toHaveValue('15 min');
    expect(missingField('alignmentOffset')).toBeNull();
    expect(screen.getByText('Start times')).toBeInTheDocument();

    setField('alignmentInterval', '');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(getScheduleSchedulingParameterValues(saved[0], service).alignmentInterval).toBeUndefined();
  });

  test('never writes Schedule.active', async () => {
    const { saved } = renderScheduleEditor({ ...scheduleWith({}), active: false });

    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].active).toBe(false);
  });

  test('flags an override of a parameter every calendar must agree on, and clears it when cleared', async () => {
    renderScheduleEditor(scheduleWith({ alignmentInterval: 15 }));

    const warning = await screen.findByTestId('scheduling-parameters-warning-cross-schedule-mismatch');
    expect(warning).toHaveTextContent('cannot be booked alongside');

    setField('alignmentInterval', '30');
    await waitFor(() =>
      expect(screen.queryByTestId('scheduling-parameters-warning-cross-schedule-mismatch')).toBeNull()
    );
  });

  test('writes only the overrides entered, leaving availability and other services alone', async () => {
    let schedule = setScheduleSchedulingParameter(scheduleWith({ bufferBefore: 20 }), service, availability);
    schedule = setScheduleSchedulingParameterValues(schedule, otherService, { slotCapacity: 4 });
    const { saved } = renderScheduleEditor(schedule);

    setField('slotCapacity', '2');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(getScheduleSchedulingParameterValues(saved[0], service)).toEqual({ bufferBefore: 20, slotCapacity: 2 });
    expect(getScheduleSchedulingParameters(saved[0], service, 'availability')).toEqual([availability]);
    expect(getScheduleSchedulingParameterValues(saved[0], otherService)).toEqual({ slotCapacity: 4 });
  });

  test('says nothing about a missing duration when the service sets one', () => {
    renderScheduleEditor(scheduleWith({}));

    expect(screen.queryByTestId('scheduling-parameters-warning-no-duration')).toBeNull();
  });

  test('warns about a missing duration set nowhere, without a jump to the hidden field', () => {
    renderScheduleEditor(baseSchedule, { ...UnconfiguredService });

    expect(screen.getByTestId('scheduling-parameters-warning-no-duration')).toHaveTextContent(
      'Duration is not set on this calendar or on the visit type'
    );
    expect(screen.queryByTestId('scheduling-parameters-warning-no-duration-focus')).toBeNull();
  });

  test('judges capacity against the buffers the calendar inherits', async () => {
    renderScheduleEditor(scheduleWith({}));

    setField('slotCapacity', '3');

    await waitFor(() =>
      expect(screen.getByTestId('scheduling-parameters-warning-capacity-with-buffers')).toBeInTheDocument()
    );
  });

  test("leaves a warning about the visit type's own values to the visit type", () => {
    // A 50 minute grid does not divide into a day, but it is the visit type's, and a calendar is not offered it.
    const awkward = buildSchedulableService({
      id: 'awkward',
      name: 'Awkward Visit',
      category: 'Office visit',
      durationMinutes: 50,
      alignmentMinutes: 50,
    });
    renderScheduleEditor(baseSchedule, awkward);

    expect(missingField('alignmentInterval')).toBeNull();
    expect(screen.queryByTestId('scheduling-parameters-warning-alignment-uneven')).toBeNull();
  });

  test('clearing every override removes the parameters extension rather than leaving the service pointer', async () => {
    const { saved } = renderScheduleEditor(scheduleWith({ bufferBefore: 20 }));

    setField('bufferBefore', '');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].extension).toBeUndefined();
  });
});

describe('scheduling parameter levels', () => {
  test('a service offers its time zones together, and only once it stores one', () => {
    expect(getVisibleParameters('service', {}).has('timezone')).toBe(false);
    expect(getVisibleParameters('service', {}).has('alignmentTimezone')).toBe(false);

    const visible = getVisibleParameters('service', { alignmentTimezone: 'America/Chicago' });
    expect(visible.has('timezone')).toBe(true);
    expect(visible.has('alignmentTimezone')).toBe(true);
  });

  test('a calendar offers each grid field only once it overrides that one', () => {
    const empty = getVisibleParameters('schedule', {});
    expect([...empty].sort()).toEqual(['bufferAfter', 'bufferBefore', 'slotCapacity', 'timezone']);

    const withOffset = getVisibleParameters('schedule', { alignmentOffset: 5 });
    expect(withOffset.has('alignmentOffset')).toBe(true);
    expect(withOffset.has('alignmentInterval')).toBe(false);
  });

  test('a calendar inherits the service value where it sets one, and the default elsewhere', () => {
    const { defaults, labels } = getInheritedDefaults({ duration: 30, bufferBefore: 5 }, 'Follow-up');

    expect(defaults).toMatchObject({ duration: 30, bufferBefore: 5, bufferAfter: 0, alignmentInterval: 60 });
    expect(labels).toMatchObject({ duration: 'Follow-up', bufferBefore: 'Follow-up', bufferAfter: 'default' });
  });

  test('on a calendar, keeps only the warnings whose inputs the calendar sets', () => {
    const inherited = { duration: 30, alignmentInterval: 50 };

    expect(getSchedulingParameterWarnings({}, {}, inherited).map((warning) => warning.id)).toEqual([]);
    expect(
      getSchedulingParameterWarnings({ alignmentInterval: 50 }, { alignmentInterval: 50 }, inherited).map(
        (warning) => warning.id
      )
    ).toEqual(expect.arrayContaining(['alignment-uneven', 'alignment-against-duration']));
  });

  test('warnings judge what a calendar inherits along with what it overrides', () => {
    const ids = getSchedulingParameterWarnings({ slotCapacity: 2 }, {}, { bufferAfter: 10, duration: 30 }).map(
      (warning) => warning.id
    );

    expect(ids).toContain('capacity-with-buffers');
    expect(ids).not.toContain('no-duration');
  });
});

describe('scheduling parameter validation', () => {
  test('accepts the values scheduling accepts', () => {
    expect(
      validateSchedulingParameters({
        duration: 30,
        bufferBefore: 0,
        bufferAfter: 0,
        alignmentInterval: 1440,
        alignmentOffset: 0,
        slotCapacity: 1,
        timezone: 'America/New_York',
      })
    ).toEqual({});
  });

  test.each([
    ['a fractional duration', { duration: 12.5 }],
    ['a duration below one minute', { duration: 0 }],
    ['a negative buffer', { bufferBefore: -5 }],
    ['an alignment interval longer than a day', { alignmentInterval: 1441 }],
    ['a capacity below one', { slotCapacity: 0 }],
    ['a fractional capacity', { slotCapacity: 1.5 }],
    ['a time zone the runtime cannot read', { timezone: 'Nowhere/Nothing' }],
  ])('refuses %s', (_case, values) => {
    expect(Object.keys(validateSchedulingParameters(values))).toHaveLength(1);
  });

  test('blocks only on a field whose value actually changed', () => {
    const errors = validateSchedulingParameters({ alignmentInterval: 2000 });

    expect(getBlockingErrors(errors, { alignmentInterval: 2000 }, { alignmentInterval: 2000 })).toEqual({});
    expect(Object.keys(getBlockingErrors(errors, { alignmentInterval: 2000 }, { alignmentInterval: 60 }))).toEqual([
      'alignmentInterval',
    ]);
  });

  test('reports an offset the server would silently take modulo the interval', () => {
    const warnings = getSchedulingParameterWarnings({ alignmentInterval: 15, alignmentOffset: 20 }, {});

    expect(warnings.find((warning) => warning.id === 'offset-exceeds-interval')?.message).toContain(
      '20 minutes works the same as 5'
    );
  });

  test('reports a gap and an overlap between the interval and the duration', () => {
    const gap = getSchedulingParameterWarnings({ duration: 30, alignmentInterval: 60 }, {});
    const overlap = getSchedulingParameterWarnings({ duration: 60, alignmentInterval: 30 }, {});

    expect(gap.find((warning) => warning.id === 'alignment-against-duration')?.message).toContain('gap');
    expect(overlap.find((warning) => warning.id === 'alignment-against-duration')?.message).toContain(
      'before the previous one ends'
    );
  });

  test.each([
    ['entering the default into an empty field', {}, { slotCapacity: 1 }],
    ['clearing a field that held the default', { slotCapacity: 1 }, {}],
  ])('says nothing about a capacity change when %s', (_case, initial, values) => {
    const warnings = getSchedulingParameterWarnings(values, initial);

    expect(warnings.some((warning) => warning.id === 'capacity-not-retroactive')).toBe(false);
  });

  test('warns about a capacity change that takes effect, including clearing back to the default', () => {
    const ids = (values: object, initial: object): string[] =>
      getSchedulingParameterWarnings(values, initial).map((warning) => warning.id);

    expect(ids({ slotCapacity: 2 }, {})).toContain('capacity-not-retroactive');
    expect(ids({}, { slotCapacity: 3 })).toContain('capacity-not-retroactive');
  });

  test.each([
    ['90 minutes', 90],
    ['two hours', 120],
  ])('warns that a %s grid anchored to UTC moves when the clocks change', (_case, alignmentInterval) => {
    const warning = getSchedulingParameterWarnings({ alignmentInterval }, {}).find(
      (candidate) => candidate.id === 'alignment-dst-shift'
    );

    expect(warning?.message).toContain('moves by an hour when the clocks change');
  });

  test.each([
    ['an interval that divides into an hour', { alignmentInterval: 30 }],
    [
      'an alignment time zone that observes the change',
      { alignmentInterval: 120, alignmentTimezone: 'America/New_York' },
    ],
  ])('says nothing about daylight saving given %s', (_case, values) => {
    const ids = getSchedulingParameterWarnings(values, {}).map((warning) => warning.id);

    expect(ids).not.toContain('alignment-dst-shift');
  });

  test('raises both the uneven and the daylight saving warning, since either alone can be the one that bites', () => {
    const ids = getSchedulingParameterWarnings({ alignmentInterval: 7 }, {}).map((warning) => warning.id);

    expect(ids).toContain('alignment-uneven');
    expect(ids).toContain('alignment-dst-shift');
  });

  describe('a calendar override of a parameter every schedule must agree on', () => {
    const inherited = { duration: 30, alignmentInterval: 30, alignmentOffset: 0 };
    const ids = (values: object): string[] =>
      getSchedulingParameterWarnings(values, {}, inherited).map((warning) => warning.id);
    const mismatch = (values: object): string | undefined =>
      getSchedulingParameterWarnings(values, {}, inherited).find((warning) => warning.id === 'cross-schedule-mismatch')
        ?.message;

    test('warns when the calendar sets a duration of its own', () => {
      expect(mismatch({ duration: 45 })).toContain('Duration differs from the visit type');
      expect(mismatch({ duration: 45 })).toContain('cannot be booked alongside');
    });

    test('says nothing when the override repeats what the visit type already sets', () => {
      expect(ids({ duration: 30, alignmentInterval: 30 })).not.toContain('cross-schedule-mismatch');
    });

    test('compares against the default where the visit type sets nothing', () => {
      expect(mismatch({ alignmentTimezone: 'America/Denver' })).toContain('Alignment time zone differs');
      expect(ids({ alignmentOffset: 0 })).not.toContain('cross-schedule-mismatch');
    });

    test('names every mismatched field, and jumps to the first', () => {
      const warning = getSchedulingParameterWarnings({ duration: 45, alignmentInterval: 15 }, {}, inherited).find(
        (candidate) => candidate.id === 'cross-schedule-mismatch'
      );

      expect(warning?.message).toContain('Duration and Interval differ from the visit type');
      expect(warning?.message).toContain('Clear the fields');
      expect(warning?.focus).toEqual({ field: 'duration', text: 'Duration' });
    });

    test('says nothing about buffers or capacity, which calendars need not agree on', () => {
      expect(ids({ bufferBefore: 20, slotCapacity: 2 })).not.toContain('cross-schedule-mismatch');
    });

    test('is not raised on the visit type itself, which has nothing to be out of step with', () => {
      expect(getSchedulingParameterWarnings({ duration: 45 }, {}).map((warning) => warning.id)).not.toContain(
        'cross-schedule-mismatch'
      );
    });
  });

  test('says nothing about the interval when it matches the duration', () => {
    const warnings = getSchedulingParameterWarnings({ duration: 30, alignmentInterval: 30 }, {});

    expect(warnings.some((warning) => warning.id === 'alignment-against-duration')).toBe(false);
  });
});

describe('timezone options', () => {
  test('accepts an alias and rejects a zone that does not exist', () => {
    expect(isSupportedTimezone('US/Pacific')).toBe(true);
    expect(isSupportedTimezone('Nowhere/Nothing')).toBe(false);
  });

  test('folds a stored zone in without duplicating one already offered', () => {
    const options = getTimezoneOptions(['Mars/Olympus_Mons', 'Etc/UTC', undefined]);

    expect(options).toContain('Mars/Olympus_Mons');
    expect(options.filter((option) => option === 'Etc/UTC')).toHaveLength(1);
  });
});
