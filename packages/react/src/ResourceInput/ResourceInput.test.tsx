import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { MedplumProvider } from '@medplum/react-hooks';
import { ResourceInput, ResourceInputProps } from './ResourceInput';

const medplum = new MockClient();

function setup(args: ResourceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ResourceInput {...args} />
    </MedplumProvider>
  );
}

describe('ResourceInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
    });
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  test('Renders default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123',
        },
        placeholder: 'Test',
      });
    });
    await waitFor(() => screen.getByText('Homer Simpson'));
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
    });

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Homer Simpson')).toBeDefined();
  });

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      resourceType: 'Patient',
      name: 'foo',
      placeholder: 'Test',
      onChange,
    });

    const input = screen.getByPlaceholderText('Test') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Simpson' } });
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

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });

  test('Handle invalid reference default value', async () => {
    await act(async () => {
      setup({
        resourceType: 'Patient',
        name: 'foo',
        defaultValue: {
          reference: '',
        },
        placeholder: 'Test',
      });
    });

    await waitFor(() => screen.getByPlaceholderText('Test'));
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });
});
