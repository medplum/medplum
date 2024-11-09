import { operationOutcomeToString } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
});
