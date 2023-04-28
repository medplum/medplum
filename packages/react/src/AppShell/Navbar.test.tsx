import { MockClient } from '@medplum/mock';
import { IconStar } from '@tabler/icons-react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { Navbar } from './Navbar';

const medplum = new MockClient();
const navigateMock = jest.fn();
const closeMock = jest.fn();

async function setup(initialUrl = '/'): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[initialUrl]} initialIndex={0}>
        <MedplumProvider medplum={medplum} navigate={navigateMock}>
          <Navbar
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
                  { label: 'Link 4', href: '/link?key=4' },
                  { label: 'Link 5', href: '/link?key=5' },
                  { label: 'Link 6', href: '/link?key=6', icon: <IconStar /> },
                ],
              },
            ]}
          />
        </MedplumProvider>
      </MemoryRouter>
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

  test('Click link on desktop', async () => {
    window.innerWidth = 1024;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toBeCalledWith('/link1');
    expect(closeMock).not.toBeCalled();
  });

  test('Click link on mobile', async () => {
    window.innerWidth = 400;
    await setup();
    expect(screen.getByText('Link 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Link 1'));
    });

    expect(navigateMock).toBeCalledWith('/link1');
    expect(closeMock).toBeCalled();
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

    expect(navigateMock).toBeCalledWith('/test-code');
  });

  test('Add Bookmark render and submit', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

    expect(input).toBeInTheDocument();

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(input).not.toBeVisible();
  });

  test('Add Bookmark close', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    expect(input).not.toBeVisible();
  });

  test('Add Bookmark save', async () => {
    await setup();

    const button = screen.getByRole('button', { name: 'Add Bookmark' }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(button);
    });

    const input = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });

    expect(input).not.toBeVisible();
  });
});
