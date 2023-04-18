import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const medplum = new MockClient();

async function setup(url = '/'): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider withGlobalStyles withNormalizeCSS>
            <App />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Click logo', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  test('Click profile', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Account settings'));
    });
  });

  test('Change profile', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add another account'));
    });
  });

  test('Click sign out', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign out'));
    });
  });

  test('Active link', async () => {
    await setup('/ServiceRequest?status=active');

    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    const activeLink = screen.getByText('Active Orders');
    const completedLink = screen.getByText('Completed Orders');
    expect(activeLink.parentElement?.className).not.toEqual(completedLink.parentElement?.className);
  });

  test('Resource Type Search', async () => {
    await setup();

    const comboboxes = screen.getAllByRole('combobox');

    let resultInput: HTMLInputElement | undefined = undefined;
    const input = screen.getByPlaceholderText('Navigate by Resource Type') as HTMLInputElement;

    for (const combobox of comboboxes) {
      const element = combobox.querySelector(`input[name="resourceType"]`) as HTMLInputElement;
      if (element) {
        resultInput = element;
        break;
      }
    }
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

    expect(screen.getByText('Test Display')).toBeDefined();
    expect(resultInput?.value).toBe('test-code');
  });

  test('Resource Type Search clear result', async () => {
    await setup();

    const comboboxes = screen.getAllByRole('combobox');

    let resultInput: HTMLInputElement | undefined = undefined;
    const input = screen.getByPlaceholderText('Navigate by Resource Type') as HTMLInputElement;

    for (const combobox of comboboxes) {
      const element = combobox.querySelector(`input[name="resourceType"]`) as HTMLInputElement;
      if (element) {
        resultInput = element;
        break;
      }
    }

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

    expect(screen.getByText('Test Display')).toBeDefined();
    expect(resultInput?.value).toBe('test-code');

    //click on search clear button
    const button = screen
      .getAllByRole('button')
      .find((el) => el.getAttribute('class')?.includes('mantine-CloseButton-root')) as HTMLElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(resultInput?.value).toBe('');
  });
});
