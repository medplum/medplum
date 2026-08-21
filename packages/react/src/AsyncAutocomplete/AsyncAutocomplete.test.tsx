// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { JSX } from 'react';
import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  selectAutocompleteOption,
  typeInAutocomplete,
  within,
} from '../test-utils/render';
import type { AsyncAutocompleteOption } from './AsyncAutocomplete';
import { AsyncAutocomplete } from './AsyncAutocomplete';
import { AsyncAutocompleteTestIds } from './AsyncAutocomplete.utils';

vi.mock('@mantine/notifications');

interface TestOption {
  readonly id: string;
  readonly name: string;
}

const apple: TestOption = { id: 'a', name: 'Apple' };
const banana: TestOption = { id: 'b', name: 'Banana' };
const cherry: TestOption = { id: 'c', name: 'Cherry' };
const allOptions = [apple, banana, cherry];

function toOption(item: TestOption): AsyncAutocompleteOption<TestOption> {
  return { value: item.id, label: item.name, resource: item };
}

async function defaultLoadOptions(input: string): Promise<TestOption[]> {
  return allOptions.filter((o) => o.name.toLowerCase().includes(input.toLowerCase()));
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: Error) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (err: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AsyncAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test('renders label, description, and placeholder', () => {
    render(
      <AsyncAutocomplete<TestOption>
        label="Fruit"
        description="Pick a fruit"
        placeholder="Search fruit"
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Fruit')).toBeInTheDocument();
    expect(screen.getByText('Pick a fruit')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search fruit')).toBeInTheDocument();
  });

  test('renders a single defaultValue as a pill', () => {
    render(
      <AsyncAutocomplete<TestOption>
        defaultValue={apple}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={vi.fn()}
      />
    );

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
  });

  test('renders an array defaultValue as pills', () => {
    render(
      <AsyncAutocomplete<TestOption>
        defaultValue={[apple, banana]}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={vi.fn()}
      />
    );

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
    expect(selected.getByText('Banana')).toBeInTheDocument();
  });

  test('dropdown is hidden until there are options or a creatable entry', () => {
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={defaultLoadOptions} onChange={vi.fn()} />);

    expect(screen.getByTestId(AsyncAutocompleteTestIds.options)).toHaveAttribute('data-hidden', 'true');
  });

  test('loads and displays options after the debounce', async () => {
    const loadOptions = vi.fn(defaultLoadOptions);
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={loadOptions} onChange={vi.fn()} />);

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'an');

    expect(loadOptions).toHaveBeenCalledWith('an', expect.anything());
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  test('selecting an option adds a pill and calls onChange', async () => {
    const onChange = vi.fn();
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={defaultLoadOptions} onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Apple', 'Apple');

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith([apple]);
  });

  test('selecting an already-selected option deselects it', async () => {
    const onChange = vi.fn();
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={defaultLoadOptions} onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Apple', 'Apple');
    expect(onChange).toHaveBeenLastCalledWith([apple]);

    // Don't wait for "Apple" text here — it's already ambiguous between the pill and the option
    await selectAutocompleteOption(input, 'Apple');
    expect(onChange).toHaveBeenLastCalledWith([]);

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.queryByText('Apple')).not.toBeInTheDocument();
  });

  test('maxValues=1 hides the search input once a value is selected', async () => {
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        maxValues={1}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Apple', 'Apple');

    expect(onChange).toHaveBeenCalledWith([apple]);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
  });

  test('maxValues=2 hides the search input and dropdown once the cap is reached', async () => {
    // Regression test: reaching the cap must clean up dropdown state for any maxValues > 1, not just 1.
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        maxValues={2}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Apple', 'Apple');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();

    await selectAutocompleteOption(input, 'Banana', 'Banana');

    expect(onChange).toHaveBeenLastCalledWith([apple, banana]);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByTestId(AsyncAutocompleteTestIds.options)).toHaveAttribute('data-hidden', 'true');
  });

  test('maxValues=0 calls onChange on every selection without keeping a pill', async () => {
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        maxValues={0}
        defaultValue={apple}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    let selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();

    const input = screen.getByRole('searchbox');
    await selectAutocompleteOption(input, 'Banana', 'Banana');

    // Selecting a new value clears any pre-existing selection and never adds a pill of its own
    expect(onChange).toHaveBeenCalledWith([banana]);
    selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.queryByText('Apple')).not.toBeInTheDocument();
    expect(selected.queryByText('Banana')).not.toBeInTheDocument();

    await selectAutocompleteOption(input, 'Cherry', 'Cherry');
    expect(onChange).toHaveBeenLastCalledWith([cherry]);
  });

  test('creatable input creates a new resource via "+ Create"', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn((name: string) => ({ id: name.toLowerCase(), name }));
    render(
      <AsyncAutocomplete<TestOption>
        creatable
        onCreate={onCreate}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'Dragonfruit');

    expect(screen.getByText('+ Create Dragonfruit')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('+ Create Dragonfruit'));
    });

    expect(onCreate).toHaveBeenCalledWith('Dragonfruit');
    expect(onChange).toHaveBeenCalledWith([{ id: 'dragonfruit', name: 'Dragonfruit' }]);
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Dragonfruit')).toBeInTheDocument();
  });

  test('shows the empty component when nothing matches and creation is disabled', async () => {
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={defaultLoadOptions} onChange={vi.fn()} />);

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'zzz');

    expect(screen.getByText('Nothing found')).toBeInTheDocument();
  });

  test('clear button removes all selections and calls onChange([])', async () => {
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        clearable
        defaultValue={[apple, banana]}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle('Clear all'));
    });

    expect(onChange).toHaveBeenCalledWith([]);
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.queryByText('Apple')).not.toBeInTheDocument();
    expect(selected.queryByText('Banana')).not.toBeInTheDocument();
  });

  test('disabled hides the search input and clear button but still shows pills', () => {
    render(
      <AsyncAutocomplete<TestOption>
        disabled
        clearable
        defaultValue={apple}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Clear all')).not.toBeInTheDocument();
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
  });

  test('removing a pill calls onChange with the remaining selection', async () => {
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        defaultValue={[apple, banana]}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    const removeButtons = selected.getAllByRole('button', { hidden: true });

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    expect(onChange).toHaveBeenCalledWith([banana]);
    expect(selected.queryByText('Apple')).not.toBeInTheDocument();
    expect(selected.getByText('Banana')).toBeInTheDocument();
  });

  test('Backspace on an empty search removes the last selected pill', async () => {
    const onChange = vi.fn();
    render(
      <AsyncAutocomplete<TestOption>
        defaultValue={[apple, banana]}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('searchbox');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
    });

    expect(onChange).toHaveBeenCalledWith([apple]);
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
    expect(selected.queryByText('Banana')).not.toBeInTheDocument();
  });

  test('minInputLength delays loadOptions until the threshold is met', async () => {
    const loadOptions = vi.fn(defaultLoadOptions);
    render(
      <AsyncAutocomplete<TestOption>
        minInputLength={3}
        toOption={toOption}
        loadOptions={loadOptions}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'ap');
    expect(loadOptions).not.toHaveBeenCalled();

    await typeInAutocomplete(input, 'app');
    expect(loadOptions).toHaveBeenCalledWith('app', expect.anything());
  });

  test('a load failure that is not an abort surfaces a notification', async () => {
    const loadOptions = vi.fn().mockRejectedValue(new Error('Server exploded'));
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={loadOptions} onChange={vi.fn()} />);

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'apple');

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', message: expect.stringContaining('Server exploded') })
    );
  });

  test('typing again aborts the pending request; only the latest result is applied', async () => {
    const first = createDeferred<TestOption[]>();
    const second = createDeferred<TestOption[]>();
    const signals: AbortSignal[] = [];
    const loadOptions = vi.fn((_input: string, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });

    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={loadOptions} onChange={vi.fn()} />);
    const input = screen.getByRole('searchbox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(loadOptions).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });
    expect(signals[0].aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(loadOptions).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve([apple]);
      await Promise.resolve();
    });
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();

    await act(async () => {
      second.resolve([banana]);
      await Promise.resolve();
    });
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  test('Enter pressed while a search is pending auto-submits the first result once it resolves', async () => {
    const deferred = createDeferred<TestOption[]>();
    const onChange = vi.fn();
    const loadOptions = vi.fn(() => deferred.promise);
    render(<AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={loadOptions} onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ap' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(loadOptions).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      deferred.resolve([apple, cherry]);
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith([apple]);
    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Apple')).toBeInTheDocument();
  });

  test('maxValues=1 autosubmit hides the dropdown and clears search after adding the result', async () => {
    // Regression test: the autosubmit path must clean up search/options/dropdown state the same way
    // manual selection does for maxValues=1, instead of leaving a dangling dropdown with no search input.
    const deferred = createDeferred<TestOption[]>();
    const onChange = vi.fn();
    const loadOptions = vi.fn(() => deferred.promise);
    render(
      <AsyncAutocomplete<TestOption> maxValues={1} toOption={toOption} loadOptions={loadOptions} onChange={onChange} />
    );

    const input = screen.getByRole('searchbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ap' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      deferred.resolve([apple, cherry]);
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith([apple]);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByTestId(AsyncAutocompleteTestIds.options)).toHaveAttribute('data-hidden', 'true');
  });

  test('autosubmit under React.StrictMode calls onChange exactly once', async () => {
    // Regression test: handleValueAdd must not call onChange from inside a setState updater function,
    // since React double-invokes updater functions under StrictMode to surface impurities.
    const deferred = createDeferred<TestOption[]>();
    const onChange = vi.fn();
    const loadOptions = vi.fn(() => deferred.promise);
    render(
      <AsyncAutocomplete<TestOption> toOption={toOption} loadOptions={loadOptions} onChange={onChange} />,
      ({ children }) => <StrictMode>{children}</StrictMode>
    );

    const input = screen.getByRole('searchbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ap' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      deferred.resolve([apple, cherry]);
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([apple]);
  });

  test('custom item, pill, and empty components render', async () => {
    const ItemComponent = (props: AsyncAutocompleteOption<TestOption>): JSX.Element => <div>Item::{props.label}</div>;
    const PillComponent = ({ item }: { item: AsyncAutocompleteOption<TestOption> }): JSX.Element => (
      <div>Pill::{item.label}</div>
    );
    const EmptyComponent = ({ search }: { search: string }): JSX.Element => <div>Empty::{search}</div>;

    render(
      <AsyncAutocomplete<TestOption>
        defaultValue={apple}
        itemComponent={ItemComponent}
        pillComponent={PillComponent}
        emptyComponent={EmptyComponent}
        toOption={toOption}
        loadOptions={defaultLoadOptions}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Pill::Apple')).toBeInTheDocument();

    const input = screen.getByRole('searchbox');
    await typeInAutocomplete(input, 'an');
    expect(screen.getByText('Item::Banana')).toBeInTheDocument();

    await typeInAutocomplete(input, 'zzz');
    expect(screen.getByText('Empty::zzz')).toBeInTheDocument();
  });
});
