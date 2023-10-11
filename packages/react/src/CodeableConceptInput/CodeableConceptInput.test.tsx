import { CodeableConcept } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { CodeableConceptInput } from './CodeableConceptInput';

const medplum = new MockClient();
const binding = 'https://example.com/test';

describe('CodeableConceptInput', () => {
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
    await setup(<CodeableConceptInput binding={binding} name="test" />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders CodeableConcept default value', async () => {
    await setup(<CodeableConceptInput binding={binding} name="test" defaultValue={{ coding: [{ code: 'abc' }] }} />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup(<CodeableConceptInput binding={binding} name="test" />);

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

  test('Create unstructured value', async () => {
    let currValue: CodeableConcept | undefined;

    await setup(<CodeableConceptInput binding={binding} name="test" onChange={(newValue) => (currValue = newValue)} />);

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    await act(async () => {
      fireEvent.focus(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'XYZ' } });
    });

    await waitFor(() => screen.getByText('+ Create XYZ'));

    await act(async () => {
      fireEvent.mouseDown(screen.getByText('+ Create XYZ'));
    });

    await waitFor(() => screen.getByText('XYZ'));

    expect(currValue).toMatchObject({
      coding: [
        {
          code: 'XYZ',
          display: 'XYZ',
        },
      ],
    });
  });

  test('Malformed value', async () => {
    const defaultValue: CodeableConcept = {
      text: 'Test',
      coding: [
        {
          system: 'https://example.com',
          code: { foo: 'bar' } as unknown as string,
        },
      ],
    };

    await setup(
      <CodeableConceptInput binding={undefined} name="test" defaultValue={defaultValue} onChange={jest.fn()} />
    );

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    await act(async () => {
      fireEvent.focus(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'XYZ' } });
    });

    await waitFor(() => screen.getByText('+ Create XYZ'));
  });
});
