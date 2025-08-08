// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, operationOutcomeToString, sleep } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, renderHook, screen } from '@testing-library/react';
import { JSX, ReactNode } from 'react';
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
});
