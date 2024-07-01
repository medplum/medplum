import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '../test-utils/render';
import { AttachmentDisplay, AttachmentDisplayProps } from './AttachmentDisplay';

function mockFetch(url: string, options: any): Promise<any> {
  const result: any = {};

  const response: any = {
    request: {
      url,
      options,
    },
    ...result,
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response),
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch,
});

async function setup(args?: AttachmentDisplayProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <AttachmentDisplay {...args} />
      </MedplumProvider>
    );
  });
}

describe('AttachmentDisplay', () => {
  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
  });

  test('Renders empty', async () => {
    await setup();
  });

  test('Renders image', async () => {
    await setup({
      value: {
        contentType: 'image/jpeg',
        url: 'https://example.com/test.jpg',
      },
    });
    expect(await screen.findByTestId('attachment-image')).toBeInTheDocument();
  });

  test('Renders video', async () => {
    await setup({
      value: {
        contentType: 'video/mp4',
        url: 'https://example.com/test.mp4',
      },
    });
    expect(await screen.findByTestId('attachment-video')).toBeInTheDocument();
  });

  test('Renders PDF', async () => {
    await setup({
      value: {
        contentType: 'application/pdf',
        url: 'https://example.com/test.pdf',
      },
    });
    expect(await screen.findByTestId('attachment-iframe')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('Renders plain text', async () => {
    await setup({ value: { contentType: 'text/plain', url: 'https://example.com/test.txt' } });
    expect(await screen.findByTestId('attachment-iframe')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('Renders JSON', async () => {
    await setup({ value: { contentType: 'application/json', url: 'https://example.com/test.json' } });
    expect(await screen.findByTestId('attachment-iframe')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('Renders other file with title', async () => {
    await setup({
      value: {
        contentType: 'text/plain',
        url: 'https://example.com/test.txt',
        title: 'test.txt',
      },
    });
    expect(await screen.findByTestId('attachment-details')).toBeInTheDocument();
    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });

  test('Renders other file without title', async () => {
    await setup({
      value: {
        contentType: 'text/plain',
        url: 'https://example.com/test.txt',
      },
    });
    expect(await screen.findByTestId('attachment-details')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});
