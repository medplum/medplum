import { operationOutcomeToString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
});
