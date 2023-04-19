import { ElementDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CodeInput } from './CodeInput';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';

const statusProperty: ElementDefinition = {
  binding: {
    valueSet: 'https://example.com/test',
  },
};

const medplum = new MockClient();

describe('CodeInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  async function setup(child: React.ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  test('Renders', async () => {
    await setup(<CodeInput property={statusProperty} name="test" />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders string default value', async () => {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <CodeInput property={statusProperty} name="test" defaultValue="xyz" />
        </MedplumProvider>
      );
    });

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('xyz')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup(<CodeInput property={statusProperty} name="test" />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();
  });

  test('Searches for results with creatable set to false', async () => {
    await setup(<CodeInput property={statusProperty} name="test" creatable={false} clearable={false} />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();
  });
});
