import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
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

describe('CreateBotPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/bots/new');
    expect(await screen.findByText('Create Bot')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/bots/new');
    expect(await screen.findByText('Create Bot')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Test Bot' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test Description' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Bot'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/bots/new');
    expect(await screen.findByText('Create Bot')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Test Bot' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test Description' },
      });
    });

    const input = screen.getByPlaceholderText('Access Policy') as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Bot'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
