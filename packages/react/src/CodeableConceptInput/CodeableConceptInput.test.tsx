import { CodeableConcept } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, within } from '../test-utils/render';
import { CodeableConceptInput, CodeableConceptInputProps } from './CodeableConceptInput';
import { AsyncAutocompleteTestIds } from '../AsyncAutocomplete/AsyncAutocomplete.utils';

const medplum = new MockClient();
const binding = 'https://example.com/test';

describe('CodeableConceptInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  async function setup(props?: Partial<CodeableConceptInputProps>): Promise<void> {
    const finalProps: CodeableConceptInputProps = {
      binding,
      name: 'test',
      path: 'Resource.test',
      outcome: undefined,
      onChange: jest.fn(),
      ...props,
    };
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <CodeableConceptInput {...finalProps} />
        </MedplumProvider>
      );
    });
  }

  test('Renders', async () => {
    await setup();

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  test('Renders CodeableConcept default value', async () => {
    await setup({ defaultValue: { coding: [{ code: 'abc' }] } });

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeDefined();
  });

  test('Searches for results', async () => {
    await setup();

    const input = screen.getByRole('searchbox') as HTMLInputElement;

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

    const selected = within(screen.getByTestId(AsyncAutocompleteTestIds.selectedItems));
    expect(selected.getByText('Test Display')).toBeDefined();
  });

  test('Create unstructured value', async () => {
    let currValue: CodeableConcept | undefined;

    await setup({ onChange: (newValue) => (currValue = newValue) });

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    await act(async () => {
      fireEvent.focus(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'XYZ' } });
    });

    expect(await screen.findByText('+ Create XYZ')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('+ Create XYZ'));
    });

    expect(await screen.findByText('XYZ')).toBeInTheDocument();

    expect(currValue).toMatchObject({
      coding: [
        {
          code: 'XYZ',
          display: 'XYZ',
        },
      ],
    });
  });

  test('Malformed value', async () => {
    const defaultValue: CodeableConcept = {
      text: 'Test',
      coding: [
        {
          system: 'https://example.com',
          code: { foo: 'bar' } as unknown as string,
        },
      ],
    };

    await setup({ defaultValue });

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    await act(async () => {
      fireEvent.focus(input);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'XYZ' } });
    });

    expect(await screen.findByText('+ Create XYZ')).toBeInTheDocument();
  });
});
