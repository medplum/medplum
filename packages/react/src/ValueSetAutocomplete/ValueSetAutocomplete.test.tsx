// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { AsyncAutocompleteTestIds } from '../AsyncAutocomplete/AsyncAutocomplete.utils';
import { act, fireEvent, render, screen, selectAutocompleteOption, typeInAutocomplete, within } from '../test-utils/render';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

describe('AsyncAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
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
