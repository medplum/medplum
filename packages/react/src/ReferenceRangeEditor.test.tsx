import { MockClient } from '@medplum/mock';
import { HDLDefinition, TestosteroneDefinition } from './stories/referenceLab';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ReferenceRangeEditor, ReferenceRangeEditorProps } from './ReferenceRangeEditor';
import { ObservationDefinition } from '@medplum/fhirtypes';

const medplum = new MockClient();

async function setup(args: ReferenceRangeEditorProps): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ReferenceRangeEditor {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('ReferenceRangeEditor', () => {
  /**
   * Render empty object
   */
  test('Renders empty', async () => {
    await setup({
      definition: {
        resourceType: 'ObservationDefinition',
      },
      onSubmit: jest.fn(),
    });
    const checkAddButton = screen.getByTitle('Add Group');
    expect(screen.getByTestId('reference-range-editor')).toBeDefined();
    expect(checkAddButton).toBeDefined();
    expect(checkAddButton.tagName).toEqual('BUTTON');
  });

  /**
   * Add group with no filters. Make sure value looks ok
   */
  test('Add and Remove group', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: {
        resourceType: 'ObservationDefinition',
      },
      onSubmit,
    });

    fireEvent.click(screen.getByTitle('Add Group'));
    fireEvent.click(screen.getByTitle('Remove Group'));
    expect(screen.queryByTestId(/'group-id-.*'/)).toBeNull();

    fireEvent.click(screen.getByText('Save'));
    expect(onSubmit).toHaveBeenCalledWith({
      qualifiedInterval: [],
      resourceType: 'ObservationDefinition',
    });
  });

  /**
   * Add group with no filters. Make sure value looks ok
   */
  test('Add Empty Group', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: {
        resourceType: 'ObservationDefinition',
      },
      onSubmit,
    });

    const addGroupButton = screen.getByTitle('Add Group');
    fireEvent.click(addGroupButton);
    const genderDropdown = screen.getByLabelText('Gender:');
    expect(genderDropdown).toBeDefined();

    // Change the gender filter for the group (should be a no-op)
    fireEvent.change(genderDropdown, { target: { value: 'male' } });
    fireEvent.click(screen.getByText('Save'));

    // Add a second empty group
    expect(screen.getByTestId('group-id-1')).toBeDefined();
    fireEvent.click(addGroupButton);
    expect(screen.getByTestId('group-id-2')).toBeDefined();

    expect(onSubmit).toHaveBeenCalledWith({
      qualifiedInterval: [],
      resourceType: 'ObservationDefinition',
    });
  });

  /**
   * Create a group 'hole'. Make sure ids are monotonic
   */
  test('Non-sequential groups', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: {
        resourceType: 'ObservationDefinition',
      },
      onSubmit,
    });

    const addGroupButton = screen.getByTitle('Add Group');

    // Add 3 groups
    fireEvent.click(addGroupButton);
    fireEvent.click(addGroupButton);
    fireEvent.click(addGroupButton);

    // Remove group #2
    fireEvent.click(screen.getByTestId('remove-group-button-group-id-2'));

    // Add a new group and make sure it's number 4
    fireEvent.click(addGroupButton);
    expect(screen.getByTestId('remove-group-button-group-id-4')).toBeDefined();
  });

  /**
   * Modify HDL gender filter. Make sure submitted value reflects filter
   */
  test('Set Gender Filter', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const genderDropdown = screen.getByLabelText('Gender:');
    fireEvent.change(genderDropdown, { target: { value: 'female' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted?.qualifiedInterval).toMatchObject([
      {
        gender: 'female',
      },
      {
        gender: 'female',
      },
      {
        gender: 'female',
      },
    ]);
  });

  /**
   * Modify HDL age filter. Make sure submitted value reflects filter
   */
  test('Set Gender Filter', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const ageLowInput = screen.getByTestId('age-group-id-1-low-value');
    const ageHighInput = screen.getByTestId('age-group-id-1-high-value');
    fireEvent.change(ageLowInput, { target: { value: '10' } });
    fireEvent.change(ageHighInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted?.qualifiedInterval).toMatchObject([
      {
        age: {
          low: { value: 10, unit: 'years', system: 'http://unitsofmeasure.org' },
          high: { value: 18, unit: 'years', system: 'http://unitsofmeasure.org' },
        },
      },
      {
        age: {
          low: { value: 10, unit: 'years', system: 'http://unitsofmeasure.org' },
          high: { value: 18, unit: 'years', system: 'http://unitsofmeasure.org' },
        },
      },
      {
        age: {
          low: { value: 10, unit: 'years', system: 'http://unitsofmeasure.org' },
          high: { value: 18, unit: 'years', system: 'http://unitsofmeasure.org' },
        },
      },
    ]);
  });

  /**
   * Modify null HDL filter to a value to something and back to null. Make sure resulting values are "undefined"
   */
  test('Set Null Filter', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const genderDropdown = screen.getByLabelText('Gender:');
    fireEvent.change(genderDropdown, { target: { value: 'female' } });
    fireEvent.change(genderDropdown, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted?.qualifiedInterval).toMatchObject([
      {
        gender: undefined,
      },
      {
        gender: undefined,
      },
      {
        gender: undefined,
      },
    ]);
  });

  /**
   * Add an interval, and ensure that unit is pre-populated
   */
  test('Add Interval', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    fireEvent.click(screen.getByTitle('Add Interval'));
    const unitInputs = screen
      .getAllByTestId(/range-id-\d+-low-unit/)
      .map((element) => (element as HTMLInputElement).value);
    expect(unitInputs).toHaveLength(4);
    expect(unitInputs[3]).toEqual('mg/dL');
  });

  /**
   * Modify HDL value. Make sure submitted interval reflects change
   */
  test('Update Range', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const valueInputs = screen.getAllByTestId(/range-id-\d+-low-value/);
    fireEvent.change(valueInputs[0], { target: { value: '3' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval?.[0].range?.low?.value).toEqual(3);
  });
  /**
   * Modify HDL condition. Make sure submitted interval reflects change
   */
  test('Update Condition', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const conditionInputs = screen.getAllByTestId(/condition-id-\d+/);
    fireEvent.change(conditionInputs[0], { target: { value: 'Very Low' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval?.condition)).toMatchObject([
      'Very Low',
      'Normal risk',
      'Negative risk',
    ]);
  });
});

/**
 * Tests:
 * Add/Remove/Change Groups:
 * [x] Render empty object
 * [x] Add group with no filters. Make sure value looks ok
 * [x] Add and remove groups. Make sure the original value looks like the original
 * [x] Create a group 'hole'. Make sure ids are monotonic
 * [x] Modify HDL gender filter. Make sure submitted value reflects gender filter
 * [ ] Modify HDL age filter. Make sure submitted value reflects age filter
 * [ ] Modify HDL endocrine filter. Make sure submitted value reflects endocrine filter
 * [x] Modify null HDL filter to a value to something and back to null. Make sure resulting values are "undefined"
 *
 *
 * Add/Remove/Change Intervals:
 * [ ] Create an interval 'hole'. Make sure ids are monotonic
 * [ ] Test existing ids (numeric)
 * [ ] Test existing ids (non-numeric)
 * [x] Modify HDL value. Make sure submitted interval reflects change
 * [x] Modify HDL condition name. Make sure submitted interval reflects change
 * [x] Add an interval, check units
 * [ ] remove an interval. Test Submitted Observation def
 *
 * Multiple Groups:
 * [ ] Change one testosterone filter to make sure it gets set only to a single group
 * [ ] Change one testosterone filter to match another group
 *
 */
