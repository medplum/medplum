import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { AnnotationInput, AnnotationInputProps } from './AnnotationInput';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const medplum = new MockClient({});

const setup = (args: AnnotationInputProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <AnnotationInput {...args} />
    </MedplumProvider>
  );
};

describe('AnnotationInput', () => {
  test('Renders undefined value', () => {
    setup({
      name: 'a',
    });
    expect(screen.queryByDisplayValue('Hello world')).toBeNull();
  });

  test('Renders default value', () => {
    setup({
      name: 'a',
      defaultValue: {
        text: 'Hello world',
      },
    });
    expect(screen.getByDisplayValue('Hello world')).toBeDefined();
  });

  test('Set value', async () => {
    const onChange = jest.fn();

    setup({
      name: 'a',
      onChange,
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Annotation text'), {
        target: { value: 'TEST' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      text: 'TEST',
      authorReference: {
        reference: 'Practitioner/123',
      },
      time: expect.anything(),
    });
  });

  test('Set value without change listener', async () => {
    setup({
      name: 'a',
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Annotation text'), {
        target: { value: 'TEST' },
      });
    });

    expect(screen.getByDisplayValue('TEST')).toBeDefined();
  });

  test('Clear value', async () => {
    const onChange = jest.fn();

    setup({
      name: 'a',
      defaultValue: {
        text: 'Hello world',
        time: '2020-01-01T00:00:00Z',
      },
      onChange,
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Annotation text'), {
        target: { value: '' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({});
  });
});
