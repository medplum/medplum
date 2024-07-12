import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ValueSetExpansionContains } from '@medplum/fhirtypes';

describe('AsyncAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  async function selectOption(input: HTMLInputElement, text: string, downCount: number): Promise<void> {
    await act(async () => {
      fireEvent.change(input, { target: { value: text } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      for (let i = 0; i < downCount; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      }
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
  }

  test('select one value', async () => {
    const onChange = jest.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" maxValues={1} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    await selectOption(input, 'Display', 1);
    expect(screen.queryByText('Test Display 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Display 3')).not.toBeInTheDocument();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code-1']);
  });

  test('select multiple values', async () => {
    const onChange = jest.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <ValueSetAutocomplete binding="x" onChange={onChange} placeholder="Test" maxValues={5} />
      </MedplumProvider>
    );

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    await selectOption(input, 'Display', 1);
    expect(screen.queryByText('Test Display 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Display 3')).not.toBeInTheDocument();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code-1']);

    await selectOption(input, 'Display', 3);
    expect(screen.queryByText('Test Display 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Display 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Display 3')).toBeInTheDocument();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.lastCall[0].map((c: ValueSetExpansionContains) => c.code)).toEqual([
      'test-code-1',
      'test-code-3',
    ]);

    // It would be nice to search by name, aka aria-label, but that doesn't work as expected
    // when hidden is true. See https://github.com/testing-library/dom-testing-library/issues/846
    const closeButtons = screen.getAllByRole('button', { hidden: true });
    // two items selected and the clear all button
    expect(closeButtons).toHaveLength(3);

    // Remove Test Display 3
    await act(async () => {
      fireEvent.click(closeButtons[1]);
    });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.lastCall[0].map((c: ValueSetExpansionContains) => c.code)).toEqual(['test-code-1']);

    // Remove Test Display 1
    await act(async () => {
      fireEvent.click(closeButtons[0]);
    });

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.lastCall[0].map((c: ValueSetExpansionContains) => c.code)).toEqual([]);
  });
});
