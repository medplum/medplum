// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications, Notifications } from '@mantine/notifications';
import { badRequest, OperationOutcomeError, serverError } from '@medplum/core';
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { AsyncAutocompleteTestIds } from '../AsyncAutocomplete/AsyncAutocomplete.utils';
import {
  act,
  fireEvent,
  render,
  screen,
  selectAutocompleteOption,
  typeInAutocomplete,
  within,
} from '../test-utils/render';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

describe('AsyncAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      cleanNotifications();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('select one value', async () => {
    const onChange = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" maxValues={1} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');

    await selectAutocompleteOption(input, 'Display', 'Test Display');
    const selected = within(screen.getByTestId('selected-items'));
    expect(selected.queryByText('Test Display')).toBeInTheDocument();
    expect(selected.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(selected.queryByText('Test Display 3')).not.toBeInTheDocument();

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code']);
  });

  test('select multiple values', async () => {
    const onChange = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" maxValues={5} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');

    await selectAutocompleteOption(input, 'Display', 'Test Display');
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.queryByText('Test Display')).toBeInTheDocument();
    expect(selected.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(selected.queryByText('Test Display 3')).not.toBeInTheDocument();

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code']);

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
    expect(selected.queryByText('Test Display')).toBeInTheDocument();
    expect(selected.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(selected.queryByText('Test Display 3')).toBeInTheDocument();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.lastCall?.[0].map((c: ValueSetExpansionContains) => c.code)).toEqual([
      'test-code',
      'test-code-3',
    ]);

    // It would be nice to search by name, aka aria-label, but that doesn't work as expected
    // when hidden is true. See https://github.com/testing-library/dom-testing-library/issues/846
    const closeButtons = screen.getAllByRole('button', { hidden: true });
    // two items selected and the clear all button
    expect(closeButtons).toHaveLength(3);

    // Remove Test Display 3
    await act(async () => {
      fireEvent.click(closeButtons[1]);
    });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.lastCall?.[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code']);

    // Remove Test Display
    await act(async () => {
      fireEvent.click(closeButtons[0]);
    });

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.lastCall?.[0].map((c: ValueSetExpansionContains) => c.code)).toEqual([]);
  });

  test('expandParams.count overrides default count', async () => {
    const medplum = new MockClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand');

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete
          binding="x"
          onChange={vi.fn()}
          placeholder="Test"
          maxValues={1}
          expandParams={{ count: 25 }}
        />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'test');

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ count: 25 }), expect.anything());
    spy.mockRestore();
  });

  test('uses default count of 10 when expandParams omits count', async () => {
    const medplum = new MockClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand');

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="x" onChange={vi.fn()} placeholder="Test" maxValues={1} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'test');

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ count: 10 }), expect.anything());
    spy.mockRestore();
  });

  test('missing value set shows helper text on mount and stops querying', async () => {
    const message = 'ValueSet http://example.com/missing not found';
    const medplum = new MockClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(badRequest(message)));

    render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <ValueSetAutocomplete binding="http://example.com/missing" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );

    // The mount-time probe discovers the missing value set before any interaction
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Suggestions unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText(/Why is this unavailable/)).toBeInTheDocument();
    // The technical detail lives in the tooltip, not in the visible copy
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'a');
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  test('missing value set disables a non-creatable field', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValue(new OperationOutcomeError(badRequest('ValueSet http://example.com/missing not found')));

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete
          binding="http://example.com/missing"
          creatable={false}
          onChange={vi.fn()}
          placeholder="Test"
        />
      </MedplumProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('This field is unavailable.')).toBeInTheDocument();
    // A disabled field renders no editable searchbox, so there is nothing to type into
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    spy.mockRestore();
  });

  test('unavailable value set recovers on remount after it is imported', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValueOnce(new OperationOutcomeError(badRequest('ValueSet http://example.com/late not found')));

    const first = render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/late" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Suggestions unavailable')).toBeInTheDocument();
    first.unmount();

    // The value set has since been imported (the mock now resolves). A fresh mount — i.e. a page
    // refresh — re-probes and recovers. There is no live subscription or cache to invalidate:
    // every mount probes, and identical probes are deduplicated by the MedplumClient request cache.
    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/late" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Suggestions unavailable')).not.toBeInTheDocument();

    spy.mockRestore();
  });

  test('transient probe failure is retried on the next mount, not cached as available', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValueOnce(new OperationOutcomeError(serverError(new Error('boom'))));

    const first = render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/flaky-probe" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByText('Suggestions unavailable')).not.toBeInTheDocument();
    first.unmount();

    // The failed probe did not settle the verdict, so the next mount immediately re-probes
    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/flaky-probe" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Suggestions unavailable')).not.toBeInTheDocument();

    spy.mockRestore();
  });

  test('failed search disarms a pending Enter', async () => {
    const medplum = new MockClient();
    const actualExpand = medplum.valueSetExpand.bind(medplum);
    const onChange = vi.fn();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockImplementation((params, options) => {
      if (params.filter === 'a') {
        throw new OperationOutcomeError(serverError(new Error('boom')));
      }
      return actualExpand(params, options);
    });

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Type and press Enter while the (failing) search is still pending
    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/Internal server error/)).toBeInTheDocument();

    // A later successful search must not auto-select on behalf of the stale Enter
    await typeInAutocomplete(input, 'test');
    expect(screen.getByText('Test Display')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test('non-creatable unavailable field shows the unavailable note alongside a validation error', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValue(new OperationOutcomeError(badRequest('ValueSet http://example.com/missing not found')));

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete
          binding="http://example.com/missing"
          creatable={false}
          error="Required field"
          onChange={vi.fn()}
          placeholder="Test"
        />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // The validation error must not hide the reason the field is disabled
    expect(screen.getByText(/Required field/)).toBeInTheDocument();
    expect(screen.getByText(/This field is unavailable/)).toBeInTheDocument();

    spy.mockRestore();
  });

  test('load error appears on focus alone', async () => {
    const medplum = new MockClient();
    // Persistent transient failure (e.g. missing integration): every search fails with a 5xx
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValue(new OperationOutcomeError(serverError(new Error('boom'))));

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/flaky" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Focus alone (no typing) triggers the search and surfaces the inline error
    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await act(async () => {
      fireEvent.focus(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/Internal server error/)).toBeInTheDocument();

    spy.mockRestore();
  });

  test('validation error and load error render together', async () => {
    const medplum = new MockClient();
    const actualExpand = medplum.valueSetExpand.bind(medplum);
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockImplementation((params, options) => {
      if (params.filter === 'a') {
        throw new OperationOutcomeError(serverError(new Error('boom')));
      }
      return actualExpand(params, options);
    });

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="x" error="Required field" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'a');

    // The validation error does not mask the load failure; both are visible
    expect(screen.getByText(/Required field/)).toBeInTheDocument();
    expect(screen.getByText(/Internal server error/)).toBeInTheDocument();

    spy.mockRestore();
  });

  test('fields with the same missing binding each show the unavailable note', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValue(new OperationOutcomeError(badRequest('ValueSet http://example.com/shared not found')));

    render(
      <MedplumProvider medplum={medplum}>
        <ValueSetAutocomplete binding="http://example.com/shared" onChange={vi.fn()} placeholder="A" />
        <ValueSetAutocomplete binding="http://example.com/shared" onChange={vi.fn()} placeholder="B" />
      </MedplumProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // Each field probes its binding on mount; in production identical probes collapse to a single
    // request in the MedplumClient cache (mocking valueSetExpand here bypasses that cache). Both
    // fields independently arrive at the same verdict and render the note.
    expect(spy).toHaveBeenCalled();
    expect(screen.getAllByText('Suggestions unavailable')).toHaveLength(2);

    spy.mockRestore();
  });

  test('rate-limited probe does not mark the value set unavailable', async () => {
    const medplum = new MockClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockRejectedValueOnce(
      new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        id: 'too-many-requests',
        issue: [{ severity: 'error', code: 'throttled', details: { text: 'Too many requests' } }],
      })
    );

    render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <ValueSetAutocomplete binding="x" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );

    // The mount-time probe gets the 429 and treats it as transient
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Suggestions unavailable')).not.toBeInTheDocument();

    // Searching still hits the server and succeeds
    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'test');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Test Display')).toBeInTheDocument();

    spy.mockRestore();
  });

  test('transient search failure shows inline error and clears on success', async () => {
    const medplum = new MockClient();
    const actualExpand = medplum.valueSetExpand.bind(medplum);
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockImplementation((params, options) => {
      if (params.filter === 'a') {
        throw new OperationOutcomeError(serverError(new Error('boom')));
      }
      return actualExpand(params, options);
    });

    render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <ValueSetAutocomplete binding="x" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'a');

    // The 5xx error appears exactly once, inline on the input, with no notification toast
    expect(screen.getAllByText(/Internal server error/)).toHaveLength(1);

    // The next search hits the server again, succeeds, and clears the inline error
    await typeInAutocomplete(input, 'test');
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument();
    expect(screen.getByText('Test Display')).toBeInTheDocument();

    spy.mockRestore();
  });

  test('repeated identical failures show a single inline error', async () => {
    const medplum = new MockClient();
    const spy = vi
      .spyOn(medplum, 'valueSetExpand')
      .mockRejectedValue(new OperationOutcomeError(serverError(new Error('boom'))));

    render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <ValueSetAutocomplete binding="x" onChange={vi.fn()} placeholder="Test" />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');
    await typeInAutocomplete(input, 'a');
    await typeInAutocomplete(input, 'ab');

    // The mount probe and both searches hit the server and failed (5xx is transient, so no
    // latch), but the error renders exactly once, inline — never as toasts
    expect(spy).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText(/Internal server error/)).toHaveLength(1);

    spy.mockRestore();
  });

  test('empty search', async () => {
    const onChange = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" maxValues={1} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>('Test');

    await typeInAutocomplete(input, '');
    const options = screen.getByTestId(AsyncAutocompleteTestIds.options);
    expect(options).not.toHaveAttribute('hidden');
    expect(onChange).toHaveBeenCalledTimes(0);
  });
});
