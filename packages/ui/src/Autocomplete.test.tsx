import { Bundle, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
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

function mockFetch(url: string, options: any): Promise<any> {
  const bundle: Bundle = {
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
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...bundle
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

test('Autocomplete handles click', async (done) => {
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
  done();
});

test('Autocomplete handles input', async (done) => {
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
  done();
});

test('Autocomplete move with arrow keys', async (done) => {
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
  done();
});

test('Autocomplete backspace key', async (done) => {
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
  done();
});

test('Autocomplete select resource with Enter key', async (done) => {
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
  done();
});

test('Autocomplete select resource with separator key', async (done) => {
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
  done();
});

test('Autocomplete select Create New', async (done) => {
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
  done();
});
