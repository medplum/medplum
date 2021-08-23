import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Autocomplete } from './Autocomplete';

describe('Autocomplete', () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );
    const input = screen.getByTestId('input-element') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  test('Renders default value', async () => {
    render(
      <Autocomplete
        name="foo"
        defaultValue={['y']}
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    // Wait for default value to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('selected'));
    });

    const selected = screen.getByTestId('selected');
    expect(selected).not.toBeUndefined();
  });

  test('Ignores empty default value', async () => {
    render(
      <Autocomplete
        name="foo"
        defaultValue={[]}
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    // Wait for default value to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('hidden'));
    });

    const hidden = screen.getByTestId('hidden') as HTMLInputElement;
    expect(hidden.value).toEqual('');
  });

  test('Backspace deletes item', async () => {
    render(
      <Autocomplete
        name="foo"
        defaultValue={['y']}
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

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

  test('Handles click', async () => {
    render(
      <Autocomplete
        name="foo"
        defaultValue={['y']}
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const container = screen.getByTestId('autocomplete');
    const input = screen.getByTestId('input-element') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(container);
    });

    expect(container.className).toContain('focused');

    await act(async () => {
      fireEvent.blur(input);
    });

    expect(container.className).not.toContain('focused');
  });

  test('Handles input', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    expect(input.value).toBe('Alice');

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    const dropdown = screen.getByTestId('dropdown');
    expect(dropdown).not.toBeUndefined();
  });

  test('Move with arrow keys', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "ArrowDown"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "ArrowUp"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
    });

    const el = screen.getByText('Alice Smith');
    expect(el).not.toBeUndefined();
  });

  test('Backspace key', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Backspace"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
    });

    const el = screen.getByText('Alice Smith');
    expect(el).not.toBeUndefined();
  });

  test('Select resource with Enter key', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    const el = screen.getByText('Alice Smith');
    expect(el).not.toBeUndefined();
  });

  test('Select resource with separator key', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press ";"
    await act(async () => {
      fireEvent.keyDown(input, { key: ';', code: ';' });
    });

    const el = screen.getByText('Alice Smith');
    expect(el).not.toBeUndefined();
  });

  test('Select Create New', async () => {
    const createNew = jest.fn();

    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        onCreateNew={createNew}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Click "Create new"
    await act(async () => {
      fireEvent.click(screen.getByText('Create new...'));
    });

    expect(createNew).toBeCalled();
  });

});
