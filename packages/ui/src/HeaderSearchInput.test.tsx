import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { HeaderSearchInput, HeaderSearchInputProps } from './HeaderSearchInput';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();
medplum.graphql = jest.fn((query: string) => {
  const data: Record<string, unknown> = {};
  if (query.includes('"Simpson"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"hom sim"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"abc"')) {
    data.Patients2 = [HomerSimpson];
  }
  if (query.includes('"9001"')) {
    data.ServiceRequestList = [HomerServiceRequest];
  }
  if (query.includes('"alpha"')) {
    const names = ['___alpha', '__alpha', '_alpha', 'alpha'];
    data.ServiceRequestList = names.map((name) => ({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [
        {
          given: [name],
        },
      ],
    }));
  }
  if (query.includes('"many"')) {
    data.Patients1 = new Array(10).fill(0).map(() => ({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [
        {
          family: '__Many__',
        },
      ],
    }));
  }
  if (query.includes('"empty"')) {
    data.Patients1 = [
      {
        resourceType: 'Patient',
        id: 'emptyPatient',
        identifier: [
          {
            system: '',
            value: '',
          },
        ],
      },
    ];
    data.ServiceRequestList = [
      {
        resourceType: 'ServiceRequest',
        id: 'emptyServiceRequest',
        identifier: [
          {
            system: '',
            value: '',
          },
        ],
      },
    ];
  }
  return Promise.resolve({ data });
});

function setup(args: HeaderSearchInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <HeaderSearchInput {...args} />
    </MedplumProvider>
  );
}

describe('HeaderSearchInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', () => {
    setup({
      name: 'foo',
      onChange: jest.fn(),
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      name: 'foo',
      onChange: jest.fn(),
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test.each(['Simpson', 'hom sim', 'abc', '9001'])('onChange with %s', async (query) => {
    const onChange = jest.fn();

    setup({
      name: 'foo',
      onChange,
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter the search term
    // Can be patient name, patient identifier, or service request identifier
    await act(async () => {
      fireEvent.change(input, { target: { value: query } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(onChange).toHaveBeenCalled();
  });

  test('Sort by relevance', async () => {
    setup({
      name: 'foo',
      onChange: jest.fn(),
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'many' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // There should only be 5 results displayed
    const elements = screen.getAllByText('__Many__');
    expect(elements.length).toBe(5);
  });

  test('Max results', async () => {
    setup({
      name: 'foo',
      onChange: jest.fn(),
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "many"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'many' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // There should only be 5 results displayed
    const elements = screen.getAllByText('__Many__');
    expect(elements.length).toBe(5);
  });

  test('Empty strings', async () => {
    setup({
      name: 'foo',
      onChange: jest.fn(),
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "empty"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'empty' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    expect(screen.getByText('Patient/emptyPatient')).toBeInTheDocument();
    expect(screen.getByText('ServiceRequest/emptyServiceRequest')).toBeInTheDocument();
  });
});
