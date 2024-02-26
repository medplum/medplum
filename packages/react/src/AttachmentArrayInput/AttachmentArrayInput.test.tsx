import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AttachmentArrayInput, AttachmentArrayInputProps } from './AttachmentArrayInput';

const medplum = new MockClient();

function setup(args?: AttachmentArrayInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <AttachmentArrayInput name="test" {...args} />
    </MedplumProvider>
  );
}

describe('AttachmentArrayInput', () => {
  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
  });

  test('Renders', () => {
    setup();
  });

  test('Renders empty array', () => {
    setup({
      name: 'test',
      defaultValue: [],
    });
  });

  test('Renders attachments', async () => {
    await act(async () => {
      await setup({
        name: 'test',
        defaultValue: [
          {
            contentType: 'image/jpeg',
            url: 'https://example.com/test.jpg',
            title: 'test.jpg',
          },
        ],
      });
    });

    expect(await screen.findByAltText('test.jpg')).toBeInTheDocument();
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
        defaultValue: [
          {
            contentType: 'image/jpeg',
            url: 'https://example.com/test.jpg',
            title: 'test.jpg',
          },
        ],
      });
    });

    await act(async () => {
      expect(await screen.findByAltText('test.jpg')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Remove'));
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
