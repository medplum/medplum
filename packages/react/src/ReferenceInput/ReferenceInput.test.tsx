import { indexStructureDefinitionBundle } from '@medplum/core';
import { FishPatientResources, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ReferenceInput, ReferenceInputProps } from './ReferenceInput';

const medplum = new MockClient();

function setup(args: ReferenceInputProps): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ReferenceInput {...args} />
    </MedplumProvider>
  );
}

describe('ReferenceInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty property', () => {
    setup({
      name: 'foo',
    });
    expect(screen.getByPlaceholderText('Resource Type')).toBeInTheDocument();
  });

  test('Renders default value resource type', async () => {
    await act(async () => {
      setup({
        name: 'foo',
        defaultValue: {
          reference: 'Patient/123',
        },
      });
    });
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Change resource type without target types', async () => {
    setup({
      name: 'foo',
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Resource Type'), {
        target: { value: 'Practitioner' },
      });
    });

    expect(screen.getByDisplayValue('Practitioner')).toBeInTheDocument();
  });

  test('Renders property with target types', () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
    });
    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Change resource type with target types', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), {
        target: { value: 'Practitioner' },
      });
    });

    expect(screen.getByTestId('reference-input-resource-type-select')).toBeInTheDocument();
  });

  test('Use autocomplete', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
      placeholder: 'Test',
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
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
  });

  test('Call onChange', async () => {
    const onChange = jest.fn();

    setup({
      name: 'foo',
      targetTypes: ['Patient', 'Practitioner'],
      placeholder: 'Test',
      onChange,
    });

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
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

  test('Handle empty target types', async () => {
    setup({
      name: 'foo',
      targetTypes: [],
    });
    expect(screen.getByPlaceholderText('Resource Type')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-input-resource-type-select')).not.toBeInTheDocument();
  });

  test('Handle Resource target type', async () => {
    setup({
      name: 'foo',
      targetTypes: ['Resource'],
    });
    // "Resource" is a FHIR special case that means "any resource type"
    expect(screen.getByPlaceholderText('Resource Type')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-input-resource-type-select')).not.toBeInTheDocument();
  });

  test('Handle profile target type', async () => {
    const FishPatientProfileSD = FishPatientResources.getFishPatientProfileSD();
    const blinky = FishPatientResources.getBlinkyTheFish();
    await medplum.createResource(blinky);

    indexStructureDefinitionBundle([FishPatientProfileSD], FishPatientProfileSD.url);
    setup({
      name: 'foo',
      targetTypes: [FishPatientProfileSD.url, 'Patient'],
      placeholder: 'My placeholder',
    });

    // Before the profile is fetch, the URL is shown
    expect(screen.getByDisplayValue(FishPatientProfileSD.url)).toBeInTheDocument();

    // wait for the profile to be fetched
    expect(await screen.findByText('Fish Patient')).toBeInTheDocument();

    // After the profile is fetched, the URl is replaced by the title
    expect(screen.queryByDisplayValue(FishPatientProfileSD.url)).toBeNull();
    expect(screen.getByDisplayValue('Fish Patient')).toBeInTheDocument();

    // Enter "B"
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('My placeholder'), { target: { value: 'B' } });
    });

    // Wait for the autocomplete timeout
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Blinky is a fish, Bart is not
    expect(screen.queryByText('Blinky')).toBeInTheDocument();
    expect(screen.queryByText('Bart Simpson')).toBeNull();

    // Select "Patient" resource type
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-input-resource-type-select'), { target: { value: 'Patient' } });
    });

    // Refocus the input; "B" still as the last value
    await act(async () => {
      fireEvent.focus(screen.getByPlaceholderText('My placeholder'));
    });

    // Wait for the autocomplete timeout
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Now that Patient is selected, both fish and non-fish are shown
    expect(screen.getByText('Bart Simpson')).toBeInTheDocument();
    expect(screen.getByText('Blinky')).toBeInTheDocument();
  });
});
