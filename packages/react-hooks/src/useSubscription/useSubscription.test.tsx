import { generateId } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import 'jest-websocket-mock';
import { ReactNode, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSubscription } from './useSubscription';

function TestComponent(): JSX.Element {
  const [lastReceived, setLastReceived] = useState<Bundle>();
  useSubscription('Communication', (bundle: Bundle) => {
    setLastReceived(bundle);
  });
  return (
    <div>
      <div data-testid="bundle">{JSON.stringify(lastReceived)}</div>
    </div>
  );
}

describe('useSubscription()', () => {
  let medplum: MockClient;

  beforeAll(() => {
    console.error = jest.fn();
  });

  async function setup(children: ReactNode): Promise<void> {
    medplum = new MockClient();
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

    await act(() => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: generateId(), type: 'history' },
      });
    });

    const el = await screen.findByTestId('bundle');
    expect(el).toBeInTheDocument();

    const bundle = JSON.parse(el.innerHTML);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('history');
  });
});
