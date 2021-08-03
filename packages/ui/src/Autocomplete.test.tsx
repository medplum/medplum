import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { Autocomplete, AutocompleteProps } from './Autocomplete';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockSearch(): Bundle {
  return {
    resourceType: 'Bundle',
    entry: [{
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      }
    }, {
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Bob'],
          family: 'Jones'
        }]
      }
    }]
  };
}

function mockPatient(): Patient {
  return {
    resourceType: 'Patient',
    id: '123',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  }
}

function mockCreateNew(): any {
  return {
    ok: true
  }
}

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (url.includes('/fhir/R4/Patient?name=')) {
    result = mockSearch();
  } else if (url.includes('/fhir/R4/Patient/123')) {
    result = mockPatient();
  } else if (url.includes('/create-new?')) {
    result = mockCreateNew();
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

beforeAll(async () => {
  await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

const setup = (args?: AutocompleteProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Autocomplete id="foo" resourceType="Patient" {...args} />
    </MedplumProvider>
  );
};

test('Autocomplete renders', () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;
  expect(input.value).toBe('');
});

test('Autocomplete renders default value', async () => {
  setup({
    id: 'foo',
    resourceType: 'Patient',
    defaultValue: [{ reference: 'Patient/123' }]
  });

  // Wait for default value to load
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => screen.getByTestId('selected'));
  });

  const selected = screen.getByTestId('selected');
  expect(selected).not.toBeUndefined();
});

test('Autocomplete ignores empty default value', async () => {
  setup({
    id: 'foo',
    resourceType: 'Patient',
    defaultValue: [{ }]
  });

  // Wait for default value to load
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => screen.getByTestId('hidden'));
  });

  const hidden = screen.getByTestId('hidden') as HTMLInputElement;
  expect(hidden.value).toEqual('');
});

test('Autocomplete backspace deletes item', async () => {
  setup({
    id: 'foo',
    resourceType: 'Patient',
    defaultValue: [{ reference: 'Patient/123' }]
  });

  // Wait for default value to load
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => screen.getByTestId('selected'));
  });

  expect(screen.getByTestId('selected')).not.toBeUndefined();

  // Press "Backspace"
  await act(async () => {
    const input = screen.getByTestId('input-element') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
  });

  const hidden = screen.getByTestId('hidden') as HTMLInputElement;
  expect(hidden.value).toEqual('');
});

test('Autocomplete handles click', async () => {
  const utils = setup();
  const container = utils.getByTestId('autocomplete');
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  await act(async () => {
    fireEvent.click(container);
  });

  expect(container.className).toContain('focused');

  await act(async () => {
    fireEvent.blur(input);
  });

  expect(container.className).not.toContain('focused');
});

test('Autocomplete handles input', async () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  expect(input.value).toBe('Alice');

  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  const dropdown = utils.getByTestId('dropdown');
  expect(dropdown).not.toBeUndefined();
});

test('Autocomplete move with arrow keys', async () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  // Enter "Alice"
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  // Wait for the drop down
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  // Press "ArrowDown"
  await act(async () => {
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
  });

  // Press "ArrowUp"
  await act(async () => {
    fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
  });

  const el = utils.getByText('Alice Smith');
  expect(el).not.toBeUndefined();
});

test('Autocomplete backspace key', async () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  // Enter "Alice"
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  // Wait for the drop down
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  // Press "Backspace"
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
  });

  const el = utils.getByText('Alice Smith');
  expect(el).not.toBeUndefined();
});

test('Autocomplete select resource with Enter key', async () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  // Enter "Alice"
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  // Wait for the drop down
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  // Press "Enter"
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });

  const el = utils.getByText('Alice Smith');
  expect(el).not.toBeUndefined();
});

test('Autocomplete select resource with separator key', async () => {
  const utils = setup();
  const input = utils.getByTestId('input-element') as HTMLInputElement;

  // Enter "Alice"
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  // Wait for the drop down
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  // Press ";"
  await act(async () => {
    fireEvent.keyDown(input, { key: ';', code: ';' });
  });

  const el = utils.getByText('Alice Smith');
  expect(el).not.toBeUndefined();
});

test('Autocomplete select Create New', async () => {
  const utils = setup({
    id: 'foo',
    resourceType: 'Patient',
    createNew: 'https://example.com/create-new'
  });

  const input = utils.getByTestId('input-element') as HTMLInputElement;

  // Enter "Alice"
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  // Wait for the drop down
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  // Press "Enter"
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });

  const el = utils.getByText('Alice Smith');
  expect(el).not.toBeUndefined();
});
