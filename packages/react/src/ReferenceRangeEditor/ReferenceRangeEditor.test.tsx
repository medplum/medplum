import { deepClone } from '@medplum/core';
import { ObservationDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HDLDefinition, TestosteroneDefinition } from '../stories/referenceLab';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ReferenceRangeEditor, ReferenceRangeEditorProps } from './ReferenceRangeEditor';

const medplum = new MockClient();

async function setup(args: ReferenceRangeEditorProps): Promise<void> {
  await act(async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ReferenceRangeEditor {...args} />
          </MedplumProvider>
        </MemoryRouter>
      </StrictMode>
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
      } as ObservationDefinition,
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
      } as ObservationDefinition,
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
      } as ObservationDefinition,
      onSubmit,
    });

    const addGroupButton = screen.getByTitle('Add Group');
    fireEvent.click(addGroupButton);
    fireEvent.click(screen.getByTitle('Add Interval'));
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
      } as ObservationDefinition,
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
    expect(checkSubmitted.qualifiedInterval).toMatchObject(
      Array(3).fill({
        gender: 'female',
      })
    );
  });

  /**
   * Modify HDL age filter. Make sure submitted value reflects filter
   */
  test('Set Age Filter', async () => {
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
    expect(checkSubmitted.qualifiedInterval).toMatchObject(
      Array(3).fill({
        age: {
          low: { value: 10, unit: 'years', system: 'http://unitsofmeasure.org' },
          high: { value: 18, unit: 'years', system: 'http://unitsofmeasure.org' },
        },
      })
    );
  });

  /**
   * Modify HDL endocrine filter. Make sure submitted value reflects filter
   */
  test('Set Endocrine Filter', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const endocrineInput = screen.getByLabelText('Endocrine:');

    fireEvent.change(endocrineInput, { target: { value: 'luteal' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval).toMatchObject(
      Array(3).fill({
        context: {
          text: 'luteal',
        },
      })
    );
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

    const endocrineDropdown = screen.getByLabelText('Endocrine:');
    fireEvent.change(endocrineDropdown, { target: { value: 'luteal' } });
    fireEvent.change(endocrineDropdown, { target: { value: '' } });

    const categoryDropdown = screen.getByLabelText('Category:');
    fireEvent.change(categoryDropdown, { target: { value: 'reference' } });
    fireEvent.change(categoryDropdown, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save'));
    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval).toMatchObject(
      Array(3).fill({
        gender: undefined,
        context: undefined,
        category: undefined,
      })
    );
  });

  /**
   * Modify category filter. Make sure submitted value reflects filter
   */
  test('Set Category Filter', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    const input = screen.getByLabelText('Category:');

    fireEvent.change(input, { target: { value: 'absolute' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval).toMatchObject(
      Array(3).fill({
        category: 'absolute',
      })
    );
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
    const lastUnitInput = screen.getByTestId('range-id-4-low-unit') as HTMLInputElement;
    expect(lastUnitInput.value).toEqual('mg/dL');
  });

  /**
   * Add an interval with existing filters, and ensure that filters propagate
   */
  test('Add Interval w/ filters', async () => {
    const onSubmit = jest.fn();
    const definition = deepClone(HDLDefinition);
    definition.qualifiedInterval = definition.qualifiedInterval?.map((interval) => ({
      ...interval,
      gender: 'female',
      age: { low: { value: 10 }, high: { value: 15 } },
    }));

    await setup({
      definition: definition,
      onSubmit,
    });

    // Add a new interval
    fireEvent.click(screen.getByTitle('Add Interval'));
    fireEvent.change(screen.getByTestId('range-id-4-low-value'), { target: { value: 99 } });

    // Save all intervals
    fireEvent.click(screen.getByText('Save'));

    // Ensure that all intervals receive the filters
    const checkSubmission = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmission.qualifiedInterval?.map((interval) => interval.gender)).toMatchObject(
      Array(4).fill('female')
    );

    expect(checkSubmission.qualifiedInterval?.map((interval) => interval.age)).toMatchObject(
      Array(4).fill({ low: { value: 10 }, high: { value: 15 } })
    );
  });

  /**
   * Remove an interval. Test Submitted Observation def
   */
  test('Remove Interval', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: HDLDefinition,
      onSubmit,
    });

    fireEvent.click(screen.getAllByTitle('Remove Interval')[1]);

    fireEvent.click(screen.getByText('Save'));
    const checkSubmission = onSubmit.mock.calls[0][0] as ObservationDefinition;
    const checkIntervalIds = checkSubmission.qualifiedInterval?.map((interval) => interval.id);
    expect(checkSubmission.qualifiedInterval).toHaveLength(2);
    expect(checkSubmission.qualifiedInterval?.[0].range).toMatchObject({
      high: {
        value: 39,
        unit: 'mg/dL',
        system: 'http://unitsofmeasure.org',
      },
    });
    expect(checkSubmission.qualifiedInterval?.[1].range).toMatchObject({
      low: {
        value: 61,
        unit: 'mg/dL',
        system: 'http://unitsofmeasure.org',
      },
    });

    expect(checkIntervalIds).toMatchObject(['id-1', 'id-3']);
  });

  /**
   * Test existing ids (numeric + non-numeric).
   */
  test('Interval Ids', async () => {
    const definition = deepClone(HDLDefinition);
    if (definition.qualifiedInterval?.[0]) {
      definition.qualifiedInterval[0].id = 'id-66';
    }
    if (definition.qualifiedInterval?.[1]) {
      definition.qualifiedInterval[1].id = 'id-foo';
    }
    if (definition.qualifiedInterval?.[2]) {
      definition.qualifiedInterval[2].id = 'id-21';
    }
    const onSubmit = jest.fn();

    await setup({
      definition,
      onSubmit,
    });

    // Add an interval and submit. The id should be one more than the highest existing interval
    fireEvent.click(screen.getByTitle('Add Interval'));
    fireEvent.click(screen.getByTitle('Add Interval'));

    fireEvent.change(screen.getByTestId('range-id-67-low-value'), { target: { value: 2 } });
    fireEvent.change(screen.getByTestId('range-id-68-low-value'), { target: { value: 8 } });

    fireEvent.click(screen.getByText('Save'));

    const checkSubmission = onSubmit.mock.calls[0][0] as ObservationDefinition;
    const checkIntervalIds = checkSubmission.qualifiedInterval?.map((interval) => interval.id);
    expect(checkIntervalIds).toMatchObject(['id-66', 'id-foo', 'id-21', 'id-67', 'id-68']);
  });

  /**
   * Test existing ids (numeric + non-numeric).
   */
  test('Interval Ids with "hole"', async () => {
    const definition = deepClone(HDLDefinition);
    if (definition.qualifiedInterval?.[0]) {
      definition.qualifiedInterval[0].id = 'id-1';
    }
    if (definition.qualifiedInterval?.[1]) {
      delete definition.qualifiedInterval[1].id;
    }
    if (definition.qualifiedInterval?.[2]) {
      definition.qualifiedInterval[2].id = 'id-2';
    }
    const onSubmit = jest.fn();

    await setup({
      definition,
      onSubmit,
    });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmission = onSubmit.mock.calls[0][0] as ObservationDefinition;
    const checkIntervalIds = checkSubmission.qualifiedInterval?.map((interval) => interval.id);
    expect(new Set(checkIntervalIds).size).toBe(3);
    expect(checkIntervalIds).toMatchObject(['id-1', 'id-3', 'id-2']);
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

    const valueInput = screen.getByTestId('range-id-1-low-value');
    fireEvent.change(valueInput, { target: { value: '3' } });
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

    const conditionInput = screen.getByTestId('condition-id-1');
    fireEvent.change(conditionInput, { target: { value: 'Very Low ' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.condition)).toMatchObject([
      'Very Low',
      'Normal risk',
      'Negative risk',
    ]);
  });

  /**
   * Make sure updating one group's filters does not affect the others
   */
  test('Update Multiple Group Filters', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: deepClone(TestosteroneDefinition),
      onSubmit,
    });

    const groups = screen.getAllByTestId(/^group-id-\d+/);
    expect(groups).toHaveLength(7);

    const ageHighInput = screen.getByTestId('age-group-id-1-high-value');
    const ageLowInput = screen.getByTestId('age-group-id-2-low-value');
    fireEvent.change(ageHighInput, { target: { value: '16' } });
    fireEvent.change(ageLowInput, { target: { value: '17' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.age?.low?.value)).toMatchObject([
      11, 11, 17, 17, 17, 20, 20, 20, 50, 50, 50, 11, 11, 20, 20, 20, 50, 50, 50,
    ]);

    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.age?.high?.value)).toMatchObject([
      16,
      16,
      19,
      19,
      19,
      49,
      49,
      49,
      undefined,
      undefined,
      undefined,
      19,
      19,
      49,
      49,
      49,
      undefined,
      undefined,
      undefined,
    ]);
  });

  /**
   * Update one group's filters to match another group. Make sure no other groups are affected
   */
  test('Overlapping Group Filters', async () => {
    const onSubmit = jest.fn();
    await setup({
      definition: deepClone(TestosteroneDefinition),
      onSubmit,
    });

    const groups = screen.getAllByTestId(/^group-id-\d+/);
    expect(groups).toHaveLength(7);

    const ageLowInput = screen.getByTestId('age-group-id-2-low-value');
    fireEvent.change(ageLowInput, { target: { value: '11' } });
    fireEvent.click(screen.getByText('Save'));

    const checkSubmitted = onSubmit.mock.calls[0][0] as ObservationDefinition;
    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.gender)).toMatchObject([
      ...Array(11).fill('male'),
      ...Array(8).fill('female'),
    ]);
    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.age?.low?.value)).toMatchObject([
      ...Array(5).fill(11),
      20,
      20,
      20,
      50,
      50,
      50,
      11,
      11,
      20,
      20,
      20,
      50,
      50,
      50,
    ]);

    expect(checkSubmitted.qualifiedInterval?.map((interval) => interval.age?.high?.value)).toMatchObject([
      14,
      14,
      19,
      19,
      19,
      49,
      49,
      49,
      undefined,
      undefined,
      undefined,
      19,
      19,
      49,
      49,
      49,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
