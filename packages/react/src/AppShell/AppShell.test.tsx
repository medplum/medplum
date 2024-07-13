import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { Logo } from '../Logo/Logo';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppShell } from './AppShell';

const medplum = new MockClient();
const navigateMock = jest.fn();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum} navigate={navigateMock}>
          <AppShell
            logo={<Logo size={24} />}
            version="test.version"
            menus={[
              {
                title: 'Menu 1',
                links: [
                  { label: 'Link 1', href: '/link1' },
                  { label: 'Link 2', href: '/link2' },
                  { label: 'Link 3', href: '/link3' },
                ],
              },
              {
                title: 'Menu 2',
                links: [
                  { label: 'Link 4', href: '/link4' },
                  { label: 'Link 5', href: '/link5' },
                  { label: 'Link 6', href: '/link6' },
                ],
              },
            ]}
          >
            Your application here
          </AppShell>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('AppShell', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup();

    expect(screen.getByText('Your application here')).toBeInTheDocument();
  });

  test('Toggle sidebar', async () => {
    await setup();
    expect(screen.getByText('Your application here')).toBeInTheDocument();
    expect(screen.queryByText('Menu 1')).not.toBeInTheDocument();

    // Click on the logo to open the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.getByText('Menu 1')).toBeInTheDocument();

    // Click on the logo to close the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.queryByText('Menu 1')).not.toBeInTheDocument();
  });

  test('Resource Type Search', async () => {
    await setup();

    // Click on the logo to open the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    const input = screen.getByPlaceholderText('Resource Type') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Different' } });
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
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

    expect(navigateMock).toHaveBeenCalledWith('/test-code');
  });
});
