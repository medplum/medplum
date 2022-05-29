import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceInput, ResourceInputProps } from './ResourceInput';

const medplum = new MockClient();

function setup(args: ResourceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ResourceInput {...args} />
    </MedplumProvider>
  );
}

describe('ResourceInput', () => {
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
      resourceType: 'Patient',
      name: 'foo',
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Renders default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123',
        },
      });
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
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

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      resourceType: 'Patient',
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
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Homer Simpson')).toBeDefined();
    expect(onChange).toHaveBeenCalled();
  });
});
