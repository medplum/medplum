import { createReference } from '@medplum/core';
import { OperationOutcome, Reference, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useResource } from './useResource';

interface TestComponentProps {
  value?: Reference | Resource;
  setOutcome?: (outcome: OperationOutcome) => void;
}

function TestComponent(props: TestComponentProps): JSX.Element {
  const resource = useResource(props.value, props.setOutcome);
  return <div data-testid="test-component">{JSON.stringify(resource)}</div>;
}

describe('useResource', () => {
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

  test('Renders null', async () => {
    await setup(<TestComponent value={null as unknown as Reference} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders undefined', async () => {
    await setup(<TestComponent value={undefined as unknown as Reference} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Handles invalid value', async () => {
    await setup(<TestComponent value={{} as unknown as Reference} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders resource', async () => {
    await setup(<TestComponent value={HomerSimpson} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toBe('');
  });

  test('Renders reference', async () => {
    await setup(<TestComponent value={createReference(HomerSimpson)} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('test-component').innerHTML).not.toBe(''));
    expect(screen.getByTestId('test-component').innerHTML).not.toBe('');
  });

  test('Renders system', async () => {
    await setup(<TestComponent value={{ reference: 'system' }} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toBe('');
  });

  test('Handles 404 not found', async () => {
    await setup(<TestComponent value={{ reference: 'Patient/not-found' }} />);
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Set outcome on error', async () => {
    const setOutcome = jest.fn();
    await setup(<TestComponent value={{ reference: 'Patient/not-found' }} setOutcome={setOutcome} />);
    await waitFor(() => expect(setOutcome).toHaveBeenCalled());
  });

  test('Responds to value change', async () => {
    function TestComponentWrapper(): JSX.Element {
      const [id, setId] = useState('123');
      return (
        <>
          <button onClick={() => setId('456')}>Click</button>
          <TestComponent value={{ id, resourceType: 'ServiceRequest' }} />
        </>
      );
    }

    await setup(<TestComponentWrapper />);

    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toContain('123');

    await act(async () => {
      fireEvent.click(screen.getByText('Click'));
    });

    expect(el.innerHTML).toContain('456');
  });

  test('Responds to value edit', async () => {
    function TestComponentWrapper(): JSX.Element {
      const [resource, setResource] = useState<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'draft',
        id: '123',
      });
      return (
        <>
          <button onClick={() => setResource((sr) => ({ ...sr, status: sr.status === 'active' ? 'draft' : 'active' }))}>
            Click
          </button>
          <TestComponent value={resource} />
        </>
      );
    }

    await setup(<TestComponentWrapper />);

    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toContain('active');

    await act(async () => {
      fireEvent.click(screen.getByText('Click'));
    });
    expect(el.innerHTML).toContain('active');

    await act(async () => {
      fireEvent.click(screen.getByText('Click'));
    });
    expect(el.innerHTML).not.toContain('active');
  });

  test('Responds to value edit after cache', async () => {
    function TestComponentWrapper(): JSX.Element {
      // Call useResource with a reference to fill the cache
      useResource({ reference: 'ServiceRequest/123' });
      const [resource, setResource] = useState<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'draft',
        id: '123',
      });

      return (
        <>
          <button
            onClick={() => {
              setResource((sr) => ({ ...sr, status: sr.status === 'active' ? 'draft' : 'active' }));
            }}
          >
            Click
          </button>
          <TestComponent value={resource} />
        </>
      );
    }

    await setup(<TestComponentWrapper />);

    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toContain('active');

    await act(async () => {
      fireEvent.click(screen.getByText('Click'));
    });
    expect(el.innerHTML).toContain('active');

    await act(async () => {
      fireEvent.click(screen.getByText('Click'));
    });
    expect(el.innerHTML).not.toContain('active');
  });
});
