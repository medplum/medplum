import { HomerServiceRequest, HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { HeaderSearchInput, HeaderSearchInputProps } from './HeaderSearchInput';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();
medplum.graphql = jest.fn((query: string) => {
  const data: Record<string, unknown> = {};
  if (query.includes('"Simpson"')) {
    data.Patients1 = [HomerSimpson];
  }
  if (query.includes('"abc"')) {
    data.Patients2 = [HomerSimpson];
  }
  if (query.includes('"9001"')) {
    data.ServiceRequestList = [HomerServiceRequest];
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
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test.each(['Simpson', 'abc', '9001'])('onChange with %s', async (query) => {
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
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(onChange).toHaveBeenCalled();
  });
});
