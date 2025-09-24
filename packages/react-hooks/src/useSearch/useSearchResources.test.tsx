// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, operationOutcomeToString, sleep } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, renderHook, screen } from '@testing-library/react';
import { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSearchResources } from './useSearch';

function TestComponent(): JSX.Element {
  const [resources, loading, outcome] = useSearchResources('Patient', { name: 'homer' });
  return (
    <div>
      <div data-testid="resources">{JSON.stringify(resources)}</div>
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

    const el = screen.getByTestId('resources');
    expect(el).toBeInTheDocument();

    const resources = JSON.parse(el.innerHTML);
    expect(Array.isArray(resources)).toBe(true);
    expect(resources as Patient[]).toHaveLength(1);
  });

  test('Debounced search', async () => {
    const medplum = new MockClient();
    const medplumSearchResources = jest.spyOn(medplum, 'searchResources');

    const { result, rerender } = renderHook(
      (props) => useSearchResources('Patient', { name: props.name }, { debounceMs: 150 }),
      {
        initialProps: { name: 'bart' },
        wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
      }
    );

    // Check until useSearch is no longer loading
    while (result.current[1]) {
      await sleep(0);
    }

    expect(result.current[0]).toHaveLength(1);
    expect(result.current[0]?.[0]?.resourceType).toEqual('Patient');
    expect(result.current[0]?.[0]?.name).toEqual([{ given: ['Bart'], family: 'Simpson' }]);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
    expect(medplumSearchResources).toHaveBeenCalledTimes(1);

    rerender({ name: 'marge' });
    expect(medplumSearchResources).toHaveBeenCalledTimes(2);
    rerender({ name: 'home' });
    expect(medplumSearchResources).toHaveBeenCalledTimes(2);
    rerender({ name: 'homer' });
    expect(medplumSearchResources).toHaveBeenCalledTimes(2);

    // Wait for debounce to time out
    await sleep(300);
    expect(medplumSearchResources).toHaveBeenLastCalledWith('Patient', { name: 'homer' });
    expect(medplumSearchResources).toHaveBeenCalledTimes(3);
    expect(result.current[0]).toHaveLength(1);
    expect(result.current[0]?.[0]?.resourceType).toEqual('Patient');
    expect(result.current[0]?.[0]?.name).toEqual([{ given: ['Homer'], family: 'Simpson' }]);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
  });
});
