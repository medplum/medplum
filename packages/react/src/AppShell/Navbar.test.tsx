import { AppShell as MantineAppShell } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { IconStar } from '@tabler/icons-react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Navbar } from './Navbar';

const medplum = new MockClient();
const navigateMock = jest.fn();
const closeMock = jest.fn();

async function setup(initial = '/'): Promise<void> {
  const initialUrl = new URL(initial, 'http://localhost');
  medplum.getUserConfiguration = jest.fn(() => {
    return {
      resourceType: 'UserConfiguration',
      id: 'test-user-config-id',
      menu: [
        {
          title: 'Favorites',
          link: [
            { name: 'Patients', target: '/Patient' },
            { name: 'Active Orders', target: '/ServiceRequest?status=active' },
            { name: 'Completed Orders', target: '/ServiceRequest?status=completed' },
          ],
        },
        {
          title: 'Admin',
          link: [
            { name: 'Project', target: '/admin/project' },
            { name: 'Batch', target: '/batch' },
          ],
        },
      ],
    };
  });
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum} navigate={navigateMock}>
        <MantineAppShell>
          <Navbar
            pathname={initialUrl.pathname}
            searchParams={initialUrl.searchParams}
            closeNavbar={closeMock}
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
                  { label: 'Link 4', href: '/link?key=4&_offset=0' },
                  { label: 'Link 5', href: '/link?key=5' },
                  { label: 'Link 6', href: '/link?key=6', icon: <IconStar /> },
                ],
              },
            ]}
            displayAddBookmark={true}
          />
        </MantineAppShell>
      </MedplumProvider>
    );
  });
}

describe('Navbar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
    closeMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Menu 1')).toBeInTheDocument();
  });

  test('Highlighted link', async () => {
    await setup('/link1');

    const link1 = screen.getByText('Link 1');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 2');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 3');
    expect(link3).toBeInTheDocument();

    // Mantine will add a class to the parent element
    // Mantine uses generated class names, so we can't test for the exact class name
    const activeClass = link1.parentElement?.className;
    const inactiveClass = link2.parentElement?.className;
    expect(activeClass).not.toEqual(inactiveClass);
    expect(link1.parentElement?.className).toEqual(activeClass);
    expect(link2.parentElement?.className).toEqual(inactiveClass);
    expect(link3.parentElement?.className).toEqual(inactiveClass);
  });

  test('Highlighted by search params', async () => {
    await setup('/link?key=4');

    const link1 = screen.getByText('Link 4');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 5');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 6');
    expect(link3).toBeInTheDocument();

    // Mantine will add a class to the parent element
    // Mantine uses generated class names, so we can't test for the exact class name
    const activeClass = link1.parentElement?.className;
    const inactiveClass = link2.parentElement?.className;
    expect(activeClass).not.toEqual(inactiveClass);
    expect(link1.parentElement?.className).toEqual(activeClass);
    expect(link2.parentElement?.className).toEqual(inactiveClass);
    expect(link3.parentElement?.className).toEqual(inactiveClass);
  });

  test('Highlighted link ignores _offset', async () => {
    await setup('/link?key=4&_offset=10');

    const link1 = screen.getByText('Link 4');
    expect(link1).toBeInTheDocument();

    const link2 = screen.getByText('Link 5');
    expect(link2).toBeInTheDocument();

    const link3 = screen.getByText('Link 6');
    expect(link3).toBeInTheDocument();

    // Mantine will add a class to the parent element
    // Mantine uses generated class names, so we can't test for the exact class name
    const activeClass = link1.parentElement?.className;
    const inactiveClass = link2.parentElement?.className;
    expect(activeClass).not.toEqual(inactiveClass);
    expect(link1.parentElement?.className).toEqual(activeClass);
    expect(link2.parentElement?.className).toEqual(inactiveClass);
    expect(link3.parentElement?.className).toEqual(inactiveClass);
  });

  test('Click link on desktop', async () => {
    window.innerWidth = 1024;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/link1');
    expect(closeMock).not.toHaveBeenCalled();
  });

  test('Click link on mobile', async () => {
    window.innerWidth = 400;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/link1');
    expect(closeMock).toHaveBeenCalled();
  });

  test('Resource Type Search', async () => {
    await setup();

    const input = screen.getByPlaceholderText('Resource Type') as HTMLInputElement;

    // Enter random text
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

  test('Add Bookmark render and submit', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = (await screen.findByPlaceholderText('Bookmark Name')) as HTMLInputElement;

    expect(input).toBeInTheDocument();

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
  });

  test('Add Bookmark close', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = (await screen.findByPlaceholderText('Bookmark Name')) as HTMLInputElement;

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
  });

  test('Add Bookmark save', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = (await screen.findByPlaceholderText('Bookmark Name')) as HTMLInputElement;

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
  });
});
