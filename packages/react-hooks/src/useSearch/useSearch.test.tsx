// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, operationOutcomeToString, sleep } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSearch } from './useSearch';

function TestComponent(): JSX.Element {
  const [bundle, loading, outcome] = useSearch('Patient', { name: 'homer' });
  return (
    <div>
      <div data-testid="bundle">{JSON.stringify(bundle)}</div>
      <div data-testid="loading">{loading}</div>
      <div data-testid="outcome">{outcome && operationOutcomeToString(outcome)}</div>
    </div>
  );
}

describe('useSearch hooks', () => {
  beforeAll(() => {
    console.error = jest.fn();
  });

  async function setup(children: ReactNode): Promise<void> {
    const medplum = new MockClient();
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Happy path', async () => {
    await setup(<TestComponent />);
    expect(await screen.findByText('All OK')).toBeInTheDocument();

    const el = screen.getByTestId('bundle');
    expect(el).toBeInTheDocument();

    const bundle = JSON.parse(el.innerHTML);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toHaveLength(1);
  });

  test('Debounced search', async () => {
    const medplum = new MockClient();
    const medplumSearch = jest.spyOn(medplum, 'search');

    const { result, rerender } = renderHook(
      (props) => useSearch('Patient', { name: props.name }, { debounceMs: 150 }),
      {
        initialProps: { name: 'bart' },
        wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
      }
    );

    // Check until useSearch is no longer loading
    while (result.current[1]) {
      await sleep(0);
    }

    expect(result.current[0]?.resourceType).toEqual('Bundle');
    expect(result.current[0]?.entry).toHaveLength(1);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
    expect(medplumSearch).toHaveBeenCalledTimes(1);

    rerender({ name: 'marge' });
    expect(medplumSearch).toHaveBeenCalledTimes(2);
    rerender({ name: 'home' });
    expect(medplumSearch).toHaveBeenCalledTimes(2);
    rerender({ name: 'homer' });
    expect(medplumSearch).toHaveBeenCalledTimes(2);

    // Wait for debounce to time out
    await sleep(300);
    expect(medplumSearch).toHaveBeenLastCalledWith('Patient', { name: 'homer' });
    expect(medplumSearch).toHaveBeenCalledTimes(3);
    expect(result.current[0]?.resourceType).toEqual('Bundle');
    expect(result.current[0]?.entry).toHaveLength(1);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
  });

  test('Slow queries returning out of order', async () => {
    const medplum = new MockClient();

    // Create deferred promises to control resolution order
    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (value: unknown) => void;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    jest
      .spyOn(medplum, 'search')
      .mockReturnValueOnce(firstPromise as ReturnType<typeof medplum.search>)
      .mockReturnValueOnce(secondPromise as ReturnType<typeof medplum.search>);

    const { result, rerender } = renderHook((props) => useSearch('Patient', { name: props.name }, { debounceMs: 0 }), {
      initialProps: { name: 'slow' },
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });

    // Initial state should be loading
    expect(result.current[1]).toBe(true);

    // Trigger a second search before the first one resolves
    rerender({ name: 'fast' });

    // Resolve the second (fast) query first
    await act(async () => {
      resolveSecond({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient', id: 'fast-patient', name: [{ given: ['Fast'] }] } }],
      });
    });

    // The result should now show the fast query result
    expect(result.current[1]).toBe(false);
    expect(result.current[0]?.entry?.[0]?.resource?.id).toBe('fast-patient');

    // Now resolve the first (slow) query - this should be ignored since the effect was cleaned up
    await act(async () => {
      resolveFirst({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient', id: 'slow-patient', name: [{ given: ['Slow'] }] } }],
      });
    });

    // The result should still show the fast query result, not the slow one
    expect(result.current[0]?.entry?.[0]?.resource?.id).toBe('fast-patient');
  });
});
