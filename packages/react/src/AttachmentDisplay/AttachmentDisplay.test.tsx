import { MedplumClient } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AttachmentDisplay, AttachmentDisplayProps } from './AttachmentDisplay';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';

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
    await waitFor(() => screen.getByTestId('attachment-image'));
  });

  test('Renders video', async () => {
    await setup({
      value: {
        contentType: 'video/mp4',
        url: 'https://example.com/test.mp4',
      },
    });
    await waitFor(() => screen.getByTestId('attachment-video'));
  });

  test('Renders PDF', async () => {
    await setup({
      value: {
        contentType: 'application/pdf',
        url: 'https://example.com/test.pdf',
      },
    });
    await waitFor(() => screen.getByTestId('attachment-pdf'));
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('Does not renders PDF with filename', async () => {
    // This is a workaround for the Content-Disposition bug.
    // In the past, files with a filename were downloaded via Content-Disposition.
    // Those files do not work with the PDF-in-iframe viewer.
    // So we do not show them.
    await setup({
      value: {
        contentType: 'application/pdf',
        url: 'https://example.com/test.pdf',
        title: 'test.pdf',
      },
    });
    await waitFor(() => screen.getByText('test.pdf'));
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-pdf')).toBeNull();
  });

  test('Renders other file with title', async () => {
    await setup({
      value: {
        contentType: 'text/plain',
        url: 'https://example.com/test.txt',
        title: 'test.txt',
      },
    });
    await waitFor(() => screen.getByTestId('attachment-details'));
    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });

  test('Renders other file without title', async () => {
    await setup({
      value: {
        contentType: 'text/plain',
        url: 'https://example.com/test.txt',
      },
    });
    await waitFor(() => screen.getByTestId('attachment-details'));
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});
