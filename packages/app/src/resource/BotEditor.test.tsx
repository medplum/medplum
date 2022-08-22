import { badRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AppRoutes } from '../AppRoutes';

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

let medplum: MockClient;

describe('BotEditor', () => {
  async function setup(url: string): Promise<void> {
    medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
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

  beforeEach(() => {
    (toast.success as unknown as jest.Mock).mockClear();
    (toast.error as unknown as jest.Mock).mockClear();
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

  test('Save success', async () => {
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

    expect(toast.success).toHaveBeenCalledWith('Saved');
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('Save error', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Save'));

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

    expect(toast.error).toHaveBeenCalledWith('Error');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('Deploy success', async () => {
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

    expect(toast.success).toHaveBeenCalledWith('Deployed');
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('Deploy error', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Deploy'));

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

    expect(toast.error).toHaveBeenCalledWith('Error');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('Execute success', async () => {
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

    expect(toast.success).toHaveBeenCalledWith('Success');
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('Execute error', async () => {
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

    expect(toast.error).toHaveBeenCalledWith('Error');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
