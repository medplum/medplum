// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { usePickListSearch } from './usePickListSearch';

/** Longer than the hook's 250ms debounce, so a typed query is guaranteed to land. */
const PAST_DEBOUNCE_MS = 500;

type Load = (query: string, signal: AbortSignal) => Promise<string[]>;

// The hook requires a stable `load`, which each test satisfies by passing the
// same function for the harness's whole life.
function Harness(props: { load: Load }): JSX.Element {
  const { items, loading, error, query, setQuery } = usePickListSearch(props.load);
  return (
    <div>
      <input aria-label="Search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="items">{items.join(',')}</div>
    </div>
  );
}

async function typeSearch(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: text } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
  });
}

async function settle(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
}

describe('usePickListSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('Stocks the list from an empty search on mount', async () => {
    const load = vi.fn().mockResolvedValue(['Main Clinic', 'Satellite Clinic']);
    render(<Harness load={load} />);

    await settle();
    expect(load).toHaveBeenCalledWith('', expect.any(AbortSignal));
    expect(screen.getByTestId('items')).toHaveTextContent('Main Clinic,Satellite Clinic');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  test('Asks the server to narrow the list, rather than filtering what it already has', async () => {
    const load = vi.fn(async (query: string) => (query ? ['Satellite Clinic'] : ['Main Clinic']));
    render(<Harness load={load} />);
    await settle();

    await typeSearch('sat');
    await settle();

    // The narrowed result replaces the first page rather than being sifted out
    // of it, so rows beyond that page can still be found.
    expect(load).toHaveBeenLastCalledWith('sat', expect.any(AbortSignal));
    expect(screen.getByTestId('items')).toHaveTextContent('Satellite Clinic');
  });

  test('Waits for typing to settle before searching again', async () => {
    const load = vi.fn().mockResolvedValue([]);
    render(<Harness load={load} />);
    await settle();
    load.mockClear();

    const input = screen.getByRole('textbox', { name: 'Search' });
    await act(async () => {
      fireEvent.change(input, { target: { value: 's' } });
      fireEvent.change(input, { target: { value: 'sa' } });
      fireEvent.change(input, { target: { value: 'sat' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    });
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('sat', expect.any(AbortSignal));
  });

  test('Surfaces a failed search and stops loading', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Location search is down'));
    render(<Harness load={load} />);

    await settle();
    expect(screen.getByTestId('error')).toHaveTextContent('Location search is down');
    expect(screen.getByTestId('items')).toHaveTextContent('');
  });

  test('Clears an earlier failure once a later search succeeds', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Location search is down')).mockResolvedValue(['Main Clinic']);
    render(<Harness load={load} />);
    await settle();
    expect(screen.getByTestId('error')).toHaveTextContent('Location search is down');

    await typeSearch('main');
    await settle();

    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('items')).toHaveTextContent('Main Clinic');
  });

  test('Ignores a search that a newer one has already replaced', async () => {
    const resolvers: ((items: string[]) => void)[] = [];
    const load = vi.fn(
      async () =>
        new Promise<string[]>((resolve) => {
          resolvers.push(resolve);
        })
    );
    render(<Harness load={load} />);

    await typeSearch('sat');
    expect(resolvers).toHaveLength(2);

    // The mount search answers last. Its results are stale, so the aborted
    // request must not overwrite what the current one is about to show.
    await act(async () => {
      resolvers[1](['Satellite Clinic']);
      resolvers[0](['Main Clinic']);
    });
    await settle();

    expect(screen.getByTestId('items')).toHaveTextContent('Satellite Clinic');
  });

  test('Ignores a failure from a search that a newer one has already replaced', async () => {
    const rejecters: ((reason: Error) => void)[] = [];
    const resolvers: ((items: string[]) => void)[] = [];
    const load = vi.fn(
      async () =>
        new Promise<string[]>((resolve, reject) => {
          resolvers.push(resolve);
          rejecters.push(reject);
        })
    );
    render(<Harness load={load} />);

    await typeSearch('sat');

    await act(async () => {
      resolvers[1](['Satellite Clinic']);
      rejecters[0](new Error('Aborted'));
    });
    await settle();

    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('items')).toHaveTextContent('Satellite Clinic');
  });
});
