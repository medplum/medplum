import { HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { HeaderSearchInput, HeaderSearchInputProps } from './HeaderSearchInput';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();
medplum.graphql = jest.fn(() => Promise.resolve({ data: { Patients1: [HomerSimpson] } }));

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

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      name: 'foo',
      onChange,
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
    expect(onChange).toHaveBeenCalled();
  });
});
