import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();

describe('ResourceVersionPage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  test('Resource not found', async () => {
    await act(async () => {
      setup('/Practitioner/not-found/_history/1');
    });

    await act(async () => {
      await jest.runAllTimersAsync();
    });

    await act(async () => {
      expect(await screen.findByText('Resource not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Version not found', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/3');
    });

    await act(async () => {
      expect(await screen.findByText('Version not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Version not found')).toBeInTheDocument();
  });

  test('Diff tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      expect(await screen.findByText('Diff')).toBeInTheDocument();
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Diff tab renders last version', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/2');
    });

    await act(async () => {
      expect(await screen.findByText('Diff')).toBeInTheDocument();
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Raw tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1/raw');
    });

    await act(async () => {
      expect(await screen.findByText('Raw')).toBeInTheDocument();
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  test('Change tab', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      expect(await screen.findByText('Diff')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });
});
