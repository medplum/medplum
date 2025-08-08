// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, operationOutcomeToString, sleep } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, renderHook, screen } from '@testing-library/react';
import { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSearchOne } from './useSearch';

function TestComponent(): JSX.Element {
  const [patient, loading, outcome] = useSearchOne('Patient', { name: 'homer' });
  return (
    <div>
      <div data-testid="patient">{JSON.stringify(patient)}</div>
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

    const el = screen.getByTestId('patient');
    expect(el).toBeInTheDocument();

    const patient = JSON.parse(el.innerHTML);
    expect(patient?.resourceType).toBe('Patient');
  });

  test('Debounced search', async () => {
    const medplum = new MockClient();
    const medplumSearchOne = jest.spyOn(medplum, 'searchOne');

    const { result, rerender } = renderHook(
      (props) => useSearchOne('Patient', { name: props.name }, { debounceMs: 150 }),
      {
        initialProps: { name: 'bart' },
        wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
      }
    );

    // Check until useSearch is no longer loading
    while (result.current[1]) {
      await sleep(0);
    }

    expect(result.current[0]?.resourceType).toEqual('Patient');
    expect(result.current[0]?.name).toEqual([{ given: ['Bart'], family: 'Simpson' }]);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
    expect(medplumSearchOne).toHaveBeenCalledTimes(1);

    rerender({ name: 'marge' });
    expect(medplumSearchOne).toHaveBeenCalledTimes(2);
    rerender({ name: 'home' });
    expect(medplumSearchOne).toHaveBeenCalledTimes(2);
    rerender({ name: 'homer' });
    expect(medplumSearchOne).toHaveBeenCalledTimes(2);

    // Wait for debounce to time out
    await sleep(300);
    expect(medplumSearchOne).toHaveBeenLastCalledWith('Patient', { name: 'homer' });
    expect(medplumSearchOne).toHaveBeenCalledTimes(3);
    expect(result.current[0]?.resourceType).toEqual('Patient');
    expect(result.current[0]?.name).toEqual([{ given: ['Homer'], family: 'Simpson' }]);
    expect(result.current[1]).toEqual(false);
    expect(result.current[2]).toEqual(allOk);
  });
});
