import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AttachmentInput, AttachmentInputProps } from './AttachmentInput';

const medplum = new MockClient();

function setup(args?: AttachmentInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <AttachmentInput name="test" {...args} />
    </MedplumProvider>
  );
}

describe('AttachmentInput', () => {
  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
  });

  test('Renders', () => {
    setup();
  });

  test('Renders attachments', async () => {
    await act(async () => {
      await setup({
        name: 'test',
        defaultValue: {
          contentType: 'image/jpeg',
          url: 'https://example.com/test.jpg',
          title: 'test.jpg',
        },
      });
    });

    await waitFor(() => screen.getByAltText('test.jpg'));
  });

  test('Add attachment', async () => {
    setup();

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(screen.getByText('hello.txt')).toBeInTheDocument();
  });

  test('Remove attachment', async () => {
    await act(async () => {
      await setup({
        name: 'test',
        defaultValue: {
          contentType: 'image/jpeg',
          url: 'https://example.com/test.jpg',
          title: 'test.jpg',
        },
      });
    });

    await waitFor(() => screen.getByAltText('test.jpg'));

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    expect(screen.queryByText('image/jpeg')).toBeNull();
  });

  test('Calls onChange', async () => {
    const onChange = jest.fn();

    setup({
      name: 'test',
      onChange,
    });

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(onChange).toHaveBeenCalled();
  });
});
