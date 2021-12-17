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
    expect(selected).toBeDefined();
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
      await waitFor(() => screen.getByTestId('autocomplete'));
    });
  });

  test('Backspace deletes item', async () => {
    let lastValue: any = undefined;

    render(
      <Autocomplete
        name="foo"
        defaultValue={['y']}
        loadOptions={async () => ['x', 'y', 'z']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        onChange={(value: any) => {
          lastValue = value;
        }}
      />
    );

    // Wait for default value to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('selected'));
    });

    expect(screen.getByTestId('selected')).toBeInTheDocument();

    // Press "Backspace"
    await act(async () => {
      const input = screen.getByTestId('input-element') as HTMLInputElement;
      fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
    });

    expect(lastValue).toBeUndefined();
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
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    expect(input.value).toBe('Alice');

    const dropdown = screen.getByTestId('dropdown');
    expect(dropdown).toBeDefined();
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
    expect(el).toBeDefined();
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
    expect(el).toBeDefined();
  });

  test('Select option with Enter key', async () => {
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
    expect(el).toBeDefined();
  });

  test('Select option with Tab key', async () => {
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

    // Press "Tab"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    });

    const el = screen.getByText('Alice Smith');
    expect(el).toBeDefined();
  });

  test('Select option with separator key', async () => {
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
    expect(el).toBeDefined();
  });

  test('Select option with click', async () => {
    const onChange = jest.fn();

    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones', 'Carol Brown']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        onChange={onChange}
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

    // Click on "Bob Jones"
    await act(async () => {
      fireEvent.click(screen.getByText('Bob Jones'));
    });

    expect(onChange).toBeCalledWith(['Bob Jones']);
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

  test('Ignore empty', async () => {
    const onChange = jest.fn();

    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => []}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        buildUnstructured={(item: string) => item}
        onChange={onChange}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Press "Tab"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    });

    expect(onChange).not.toBeCalled();
  });

  test('Build unstructured', async () => {
    const onChange = jest.fn();

    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => []}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        buildUnstructured={(item: string) => item}
        onChange={onChange}
      />
    );

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "xyz"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
      input.value = 'xyz';
    });

    // Wait for the timers
    // Dropdown will never come, because there are zero matches
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press "Tab"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    });

    expect(onChange).toBeCalled();
    expect(screen.getByText('xyz')).toBeDefined();
  });

  test('Hover over row', async () => {
    const onChange = jest.fn();

    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones', 'Carol Brown']}
        getId={(item: string) => item}
        getDisplay={(item: string) => <span>{item}</span>}
        onChange={onChange}
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

    // Hover over "Bob Jones"
    await act(async () => {
      fireEvent.mouseOver(screen.getByText('Bob Jones'));
    });

    const dropdown = screen.getByTestId('dropdown');
    const option = dropdown.querySelector('.medplum-autocomplete-active');
    expect(option).toBeDefined();
    expect(option?.innerHTML).toMatch(/Bob Jones/);

    // Press "Tab"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    });

    expect(onChange).toBeCalledWith(['Bob Jones']);
  });

  test('Dropdown goes away if no input', async () => {
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

    // Remove input
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    // Wait for the drop down to go away
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId('dropdown')).toBeNull();
  });

  test('Down arrow does not go past last entry', async () => {
    render(
      <Autocomplete
        name="foo"
        loadOptions={async () => ['Alice Smith', 'Bob Jones', 'Carol Brown']}
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

    // Press "ArrowDown" 10 times
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      });
    }

    const dropdown = screen.getByTestId('dropdown');
    const option = dropdown.querySelector('.medplum-autocomplete-active');
    expect(option).toBeDefined();
    expect(option?.innerHTML).toMatch(/Carol Brown/);
  });
});
