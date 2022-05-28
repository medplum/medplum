import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResourcePage } from './ResourcePage';

let medplum: MockClient;

describe('BotEditor', () => {
  async function setup(url: string): Promise<void> {
    medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Routes>
              <Route path="/:resourceType/:id/:tab" element={<ResourcePage />} />
            </Routes>
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

  test('Bot editor', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Editor'));
    expect(screen.getByText('Editor')).toBeInTheDocument();

    await act(async () => {
      fireEvent.load(screen.getByTestId<HTMLIFrameElement>('code-frame'));
    });

    await act(async () => {
      fireEvent.load(screen.getByTestId<HTMLIFrameElement>('input-frame'));
    });
  });

  test('Save', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Save'));

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
  });

  test('Simulate', async () => {
    expect.assertions(6);

    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Simulate'));

    // Mock the code frame
    (screen.getByTestId<HTMLIFrameElement>('code-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: 'console.log("foo");' });
    };

    // Mock the input frame
    (screen.getByTestId<HTMLIFrameElement>('input-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: '{"resourceType":"Patient"}' });
    };

    // Mock the bot runner frame
    (screen.getByTestId<HTMLIFrameElement>('output-frame').contentWindow as Window).postMessage = (
      message: any,
      targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      expect(message).toBeDefined();
      expect(message.command).toEqual('execute');
      expect(message.code).toEqual('console.log("foo");');
      expect(message.input).toEqual({ resourceType: 'Patient' });
      expect(targetOrigin).toEqual('https://codeeditor.medplum.com');
      expect(transfer).toBeDefined();
      (transfer?.[0] as MessagePort).postMessage({ result: 'ok' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Simulate'));
    });
  });

  test('Deploy', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Deploy'));

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
  });

  test('Execute', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Execute'));

    // Mock the input frame
    (screen.getByTestId<HTMLIFrameElement>('input-frame').contentWindow as Window).postMessage = (
      _message: any,
      _targetOrigin: any,
      transfer?: Transferable[]
    ) => {
      (transfer?.[0] as MessagePort).postMessage({ result: '{"resourceType":"Patient"}' });
    };

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });
  });
});
