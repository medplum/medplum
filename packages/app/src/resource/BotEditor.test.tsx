// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

describe('BotEditor', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    vi.spyOn(medplum, 'download').mockImplementation(async () => ({ text: async () => 'test' }) as unknown as Blob);

    // Mock bot operations
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);
    medplum.router.router.add('POST', 'Bot/:id/$execute', async () => [allOk]);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <AppRoutes />
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  beforeAll(() => {
    window.MessageChannel = class {
      readonly port1 = {
        close: () => undefined,
      } as unknown as MessagePort;

      readonly port2 = {
        postMessage: (data: any) => {
          this.port1.onmessage?.({ data } as unknown as MessageEvent);
        },
      } as unknown as MessagePort;
    };
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('Bot editor', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Editor')).toBeInTheDocument();
    expect(await screen.findByTestId('code-frame')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();

    await act(async () => {
      fireEvent.load(screen.getByTestId<HTMLIFrameElement>('code-frame'));
    });
  });

  test('Save success', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Save')).toBeInTheDocument();

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'console.log("foo");' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  test('Save error', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Save')).toBeInTheDocument();

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ error: badRequest('Error') });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('Deploy success', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Deploy')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Deploy'));
    });

    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  test('Deploy error', async () => {
    const medplum = new MockClient();
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [badRequest('Something went wrong')]);

    await setup('/Bot/123/editor', medplum);
    expect(await screen.findByText('Deploy')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Deploy'));
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('Execute success', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Execute')).toBeInTheDocument();

    // Mock the output frame
    (screen.getByTestId<HTMLIFrameElement>('output-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'ok' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('Execute error', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Execute')).toBeInTheDocument();

    // Mock the output frame
    (screen.getByTestId<HTMLIFrameElement>('output-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ error: badRequest('Error') });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('Legacy bot', async () => {
    // Bots now use "sourceCode" and "executableCode" instead of "code"
    // While "code" is deprecated, it is still supported for legacy bots

    // Create a Bot with "code" instead of "sourceCode" and "executableCode"
    const medplum = new MockClient();
    const legacyBot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      code: 'console.log("foo");',
    });

    await setup(`/Bot/${legacyBot.id}/editor`, medplum);
    expect(await screen.findByText('Save')).toBeInTheDocument();

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'console.log("foo");' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();

    const check = await medplum.readResource('Bot', legacyBot.id);
    expect(check.sourceCode).toBeDefined();
    expect(check.sourceCode?.url).toBeDefined();
  });

  function mockSseResponse(chunks: string[], ok = true, status = 200, errorBody?: unknown): Response {
    let index = 0;
    const reader = {
      read: async () => {
        if (index < chunks.length) {
          return { done: false, value: chunks[index++] };
        }
        return { done: true, value: undefined };
      },
    };
    return {
      ok,
      status,
      text: async () => (typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody)),
      // pipeThrough ignores the decoder in tests; chunks are already strings
      body: { pipeThrough: () => ({ getReader: () => reader }) },
    } as unknown as Response;
  }

  test('Execute with SSE', async () => {
    const medplum = new MockClient();
    const downloadResponse = vi
      .spyOn(medplum, 'downloadResponse')
      .mockResolvedValue(
        mockSseResponse(['event: progress\ndata: step 1\n\n', 'event: progress\ndata: step 2\n\ndata: done\n\n'])
      );

    await setup('/Bot/123/editor', medplum);
    expect(await screen.findByText('Execute')).toBeInTheDocument();

    // Open the split-button dropdown and choose the SSE option
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Execute options'));
    });
    const sseButton = await screen.findByText('Execute SSE');
    await act(async () => {
      fireEvent.click(sseButton);
    });

    expect(await screen.findByText('Stream complete')).toBeInTheDocument();
    expect(screen.getByTestId('sse-output')).toBeInTheDocument();
    expect(screen.getByText('step 1')).toBeInTheDocument();
    expect(screen.getByText('step 2')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();

    // The request was sent with the event-stream Accept header
    expect(downloadResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      })
    );
  });

  test('Streaming bot defaults to Execute SSE', async () => {
    const medplum = new MockClient();
    const streamingBot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      streamingEnabled: true,
    });
    const downloadResponse = vi
      .spyOn(medplum, 'downloadResponse')
      .mockResolvedValue(mockSseResponse(['data: streamed\n\n']));

    await setup(`/Bot/${streamingBot.id}/editor`, medplum);

    // The primary button defaults to SSE, and there is no synchronous "Execute" button
    expect(await screen.findByText('Execute SSE')).toBeInTheDocument();
    expect(screen.queryByText('Execute')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Execute SSE'));
    });

    expect(await screen.findByText('Stream complete')).toBeInTheDocument();
    expect(screen.getByText('streamed')).toBeInTheDocument();
    expect(downloadResponse).toHaveBeenCalled();
  });

  test('Execute with SSE error', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'downloadResponse').mockResolvedValue(
      mockSseResponse([], false, 400, badRequest('Bot is not enabled'))
    );

    await setup('/Bot/123/editor', medplum);
    expect(await screen.findByText('Execute')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Execute options'));
    });
    const sseButton = await screen.findByText('Execute SSE');
    await act(async () => {
      fireEvent.click(sseButton);
    });

    expect(await screen.findByText('Bot is not enabled')).toBeInTheDocument();
  });

  test('HL7 input', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Execute')).toBeInTheDocument();

    // Mock the output frame
    (screen.getByTestId<HTMLIFrameElement>('output-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'ok' });
    };

    // Change input type to HL7
    const contentTypeInput = screen.getByDisplayValue('FHIR');
    await act(async () => {
      fireEvent.change(contentTypeInput, { target: { value: 'x-application/hl7-v2+er7' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
