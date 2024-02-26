import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

describe('BotEditor', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    jest.spyOn(medplum, 'download').mockImplementation(async () => ({ text: async () => 'test' }) as unknown as Blob);

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

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'console.log("foo");' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Deploy'));
    });

    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  test('Deploy error', async () => {
    await setup('/Bot/123/editor');
    expect(await screen.findByText('Deploy')).toBeInTheDocument();

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ error: badRequest('Error') });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Deploy'));
    });

    expect(screen.getByText('Error')).toBeInTheDocument();
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

    const check = await medplum.readResource('Bot', legacyBot.id as string);
    expect(check.sourceCode).toBeDefined();
    expect(check.sourceCode?.url).toBeDefined();
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
    const contentTypeInput = screen.getByDisplayValue('FHIR') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(contentTypeInput, { target: { value: 'x-application/hl7-v2+er7' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
