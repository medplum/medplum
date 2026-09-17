// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { SchedulingParametersURI } from '@medplum/core';
import type { Extension, HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { getHealthcareServiceSchedulingParameterValues } from '../parameterValues';
import { buildSchedulableService, FullyConfiguredService, UnconfiguredService } from '../stories/scheduling';
import { fireEvent, render, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { SchedulingParametersEditor } from './SchedulingParametersEditor';
import {
  getBlockingErrors,
  getSchedulingParameterWarnings,
  getTimezoneOptions,
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

function saveButton(): HTMLElement {
  return screen.getByTestId('scheduling-parameters-save');
}

/**
 * Captures what the editor hands back, which is the only thing it ever produces.
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
    fireEvent.click(screen.getByTestId('scheduling-parameters-active'));
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].active).toBe(false);
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

  test('deactivating names every consequence, including the one nobody expects', async () => {
    const { saved } = renderEditor(FullyConfiguredService);

    fireEvent.click(screen.getByTestId('scheduling-parameters-active'));

    const warning = await screen.findByTestId('scheduling-parameters-deactivate-warning');
    expect(warning).toHaveTextContent('New bookings stop');
    expect(warning).toHaveTextContent('can still be cancelled');
    expect(warning).toHaveTextContent('on hold can no longer be confirmed');
    expect(saveButton()).toHaveTextContent('Save and deactivate');

    fireEvent.click(saveButton());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].active).toBe(false);
  });

  test('reactivating writes active explicitly, since an absent flag already means active', async () => {
    const inactive: WithId<HealthcareService> = { ...FullyConfiguredService, active: false };
    const { saved } = renderEditor(inactive);

    fireEvent.click(screen.getByTestId('scheduling-parameters-active'));
    expect(saveButton()).toHaveTextContent('Save and reactivate');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].active).toBe(true);
  });

  test('leaves the time zone out for a visit type that sets none', () => {
    renderEditor(FullyConfiguredService);

    expect(screen.queryByTestId('scheduling-parameters-timezone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scheduling-parameters-warning-no-timezone')).not.toBeInTheDocument();
  });

  interface StoredZones {
    timezone?: string;
    alignmentTimezone?: string;
  }

  describe('the time zone fields', () => {
    /**
     * Builds a visit type carrying only the time zone parameters given.
     * @param zones - The time zone parameters to store.
     * @returns A visit type with those, and nothing else.
     */
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

    const cases: [string, StoredZones][] = [
      ['only a time zone', { timezone: 'America/Chicago' }],
      ['only an alignment time zone', { alignmentTimezone: 'America/Chicago' }],
      ['both', { timezone: 'America/Chicago', alignmentTimezone: 'Europe/Berlin' }],
    ];

    test.each(cases)('are both shown when the visit type stores %s', (_case, zones) => {
      renderEditor(withZones(zones));

      for (const key of ['timezone', 'alignmentTimezone'] as const) {
        expect(field(key)).toHaveValue(zones[key] ?? '');
        expect(field(key)).toHaveAttribute('readonly');
        // Only a zone that is actually stored offers to remove it. An empty field has nothing to undo.
        const remove = screen.queryByTestId(`scheduling-parameters-${key}-remove`);
        if (zones[key] === undefined) {
          expect(remove).toBeNull();
        } else {
          expect(remove).toBeInTheDocument();
        }
      }
    });

    test('an alignment time zone can be removed, and the removal undone', async () => {
      const { saved } = renderEditor(withZones({ alignmentTimezone: 'America/Chicago' }));

      fireEvent.click(screen.getByTestId('scheduling-parameters-alignmentTimezone-remove'));
      expect(field('alignmentTimezone')).toHaveValue('');
      fireEvent.click(screen.getByTestId('scheduling-parameters-alignmentTimezone-restore'));
      expect(field('alignmentTimezone')).toHaveValue('America/Chicago');

      fireEvent.click(screen.getByTestId('scheduling-parameters-alignmentTimezone-remove'));
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).alignmentTimezone).toBeUndefined();
    });

    test('removing one leaves the other stored', async () => {
      const zones = { timezone: 'America/Chicago', alignmentTimezone: 'Europe/Berlin' };
      const { saved } = renderEditor(withZones(zones));

      fireEvent.click(screen.getByTestId('scheduling-parameters-timezone-remove'));
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0])).toEqual({ alignmentTimezone: 'Europe/Berlin' });
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

    test('is shown read-only', () => {
      renderEditor(service);

      expect(field('timezone')).toHaveValue('America/Chicago');
      expect(field('timezone')).toHaveAttribute('readonly');
    });

    test('survives a save that changes something else', async () => {
      const { saved } = renderEditor(service);

      setField('bufferBefore', '15');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).timezone).toBe('America/Chicago');
    });

    test('can be removed, and the field stays so the removal can be undone', async () => {
      const { saved } = renderEditor(service);

      fireEvent.click(screen.getByTestId('scheduling-parameters-timezone-remove'));
      expect(field('timezone')).toHaveValue('');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).timezone).toBeUndefined();
    });

    test('can be restored after removing it', async () => {
      const { saved } = renderEditor(service);

      fireEvent.click(screen.getByTestId('scheduling-parameters-timezone-remove'));
      fireEvent.click(screen.getByTestId('scheduling-parameters-timezone-restore'));
      expect(field('timezone')).toHaveValue('America/Chicago');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(getHealthcareServiceSchedulingParameterValues(saved[0]).timezone).toBe('America/Chicago');
    });

    test('is shown even when this runtime does not recognize it, and does not block a save', async () => {
      const unknown: WithId<HealthcareService> = {
        ...UnconfiguredService,
        extension: [{ url: SchedulingParametersURI, extension: [{ url: 'timezone', valueCode: 'Mars/Olympus_Mons' }] }],
      };
      const { saved } = renderEditor(unknown);

      expect(field('timezone')).toHaveValue('Mars/Olympus_Mons');
      fireEvent.click(saveButton());

      await waitFor(() => expect(saved).toHaveLength(1));
    });
  });

  test('a rejected save leaves the button usable rather than stuck pending', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('conflict'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SchedulingParametersEditor service={FullyConfiguredService} onSave={failing} />);

    fireEvent.click(saveButton());

    await waitFor(() => expect(failing).toHaveBeenCalled());
    await waitFor(() => expect(saveButton()).not.toHaveAttribute('data-loading'));
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

  test('leaves an interval that does not divide into a day to the uneven warning alone', () => {
    const ids = getSchedulingParameterWarnings({ alignmentInterval: 7 }, {}).map((warning) => warning.id);

    expect(ids).toContain('alignment-uneven');
    expect(ids).not.toContain('alignment-dst-shift');
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
