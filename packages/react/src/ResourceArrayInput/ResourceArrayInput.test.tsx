import { InternalSchemaElement } from '@medplum/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ResourceArrayInput, ResourceArrayInputProps } from './ResourceArrayInput';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';

const medplum = new MockClient();

const property: InternalSchemaElement = {
  path: 'test',
  description: 'Test',
  min: 0,
  max: 3,
  type: [
    {
      code: 'string',
    },
  ],
};

const slicedProperty: InternalSchemaElement = {
  path: 'IceCream.flavors',
  description: 'A list of ice cream flavors',
  min: 0,
  max: 3,
  type: [{ code: 'Extension' }],
  slicing: {
    discriminator: [{ path: 'url', type: 'value' }],
    ordered: false,
    slices: [
      {
        name: 'chocolateVariety',
        path: 'IceCream.flavors',
        definition: 'The type of chocolate you prefer',
        elements: {
          url: {
            path: 'IceCream.flavors.url',
            description: '',
            fixed: { type: 'uri', value: 'chocolateVariety' },
            min: 1,
            max: 1,
            type: [{ code: 'uri' }],
          },
          'value[x]': {
            path: 'IceCream.flavors.value[x]',
            description: '',
            min: 1,
            max: 1,
            type: [{ code: 'string' }],
          },
        },
        min: 0,
        max: 1,
        type: [{ code: 'Extension' }],
      },
      {
        name: 'vanillaVariety',
        path: 'IceCream.flavors',
        definition: 'The type of vanilla ice cream you prefer',
        elements: {
          url: {
            path: 'IceCream.flavors.url',
            description: '',
            fixed: { type: 'uri', value: 'vanillaVariety' },
            min: 1,
            max: 1,
            type: [{ code: 'uri' }],
          },
          'value[x]': {
            path: 'IceCream.flavors.value[x]',
            description: '',
            min: 1,
            max: 1,
            type: [{ code: 'string' }],
          },
        },
        min: 0,
        max: 1,
        type: [{ code: 'Extension' }],
      },
    ],
  },
};

const defaultProps: Pick<ResourceArrayInputProps, 'name' | 'property' | 'outcome'> = {
  name: 'myProp',
  property,
  outcome: undefined,
};

describe('ResourceArrayInput', () => {
  async function setup(props: ResourceArrayInputProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ResourceArrayInput {...props} />
        </MedplumProvider>
      );
    });
  }
  test('Renders default', async () => {
    await setup({
      ...defaultProps,
    });

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Renders empty', async () => {
    await setup({
      ...defaultProps,
      defaultValue: [],
    });

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Renders elements', async () => {
    await setup({
      ...defaultProps,
      defaultValue: ['foo', 'bar'],
    });

    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
    expect(screen.getByTitle('Add')).toBeInTheDocument();
    expect(screen.getAllByTitle('Remove')).toHaveLength(2);
  });

  test('Handles non-arrays', async () => {
    await setup({
      ...defaultProps,
      defaultValue: 'x' as unknown as string[],
    });

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Click add button', async () => {
    await setup({
      ...defaultProps,
      defaultValue: [],
    });

    expect(screen.getByTitle('Add')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Add'));
    });

    expect(screen.getByTestId('myProp.0')).toBeInTheDocument();
  });

  test('Click remove button', async () => {
    await setup({
      ...defaultProps,
      defaultValue: ['foo', 'bar'],
    });

    await act(async () => {
      fireEvent.click(screen.getAllByTitle('Remove')[0]);
    });

    expect(screen.queryByDisplayValue('foo')).toBeNull();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
  });

  test('Change value', async () => {
    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      defaultValue: ['foo', 'bar'],
      onChange,
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('foo'), {
        target: { value: 'baz' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(['baz', 'bar']);
  });

  test('With slices and no default values', async () => {
    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      property: slicedProperty,
      hideNonSliceValues: false,
      defaultValue: [],
      onChange,
    });

    const testIdsThatShouldExist = [
      'slice-chocolateVariety-elements',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements',
      'slice-vanillaVariety-remove-0',
      'nonsliced-add',
    ];
    testIdsThatShouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    const testIdsThatShouldNotExist = ['slice-chocolateVariety-add', 'slice-vanillaVariety-add', 'nonsliced-remove-0'];
    testIdsThatShouldNotExist.forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slice-chocolateVariety-remove-0'));
    });

    expect(screen.getByTestId('slice-chocolateVariety-add')).toBeInTheDocument();
    expect(screen.queryByTestId('slice-chocolateVariety-remove-0')).toBeNull();
    expect(screen.queryByTestId('slice-chocolateVariety-elements')).toBeNull();
  });

  test('With slices and values not in any slice', async () => {
    const onChange = jest.fn();

    const property = { ...slicedProperty, max: 4 };
    await setup({
      ...defaultProps,
      property,
      hideNonSliceValues: false,
      defaultValue: [{ code: 'GREEN', text: 'Pistachio' }],
      onChange,
    });

    const testIdsThatShouldExist = [
      'slice-chocolateVariety-elements',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements',
      'slice-vanillaVariety-remove-0',
      'nonsliced-add',
      'nonsliced-remove-0',
    ];
    testIdsThatShouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    const testIdsThatShouldNotExist = ['slice-chocolateVariety-add', 'sliced-vanillaVariety-add'];
    testIdsThatShouldNotExist.forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });
  });

  test.only('With slices and values in each slice and non-slice values', async () => {
    const onChange = jest.fn();

    const defaultValue = [
      { url: 'chocolateVariety', valueString: 'Milk Chocolate' },
      { url: 'vanillaVariety', valueString: 'French Vanilla' },
      { url: 'greenVariety', valueString: 'Pistachio' },
    ];
    await setup({
      ...defaultProps,
      property: slicedProperty,
      hideNonSliceValues: false,
      defaultValue,
      onChange,
    });

    const testIdsThatShouldExist = [
      'slice-chocolateVariety-elements',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements',
      'slice-vanillaVariety-remove-0',
      'nonsliced-remove-0',
    ];
    testIdsThatShouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    // Since the property has max: 3, shouldn't be able to add anything
    const testIdsThatShouldNotExist = ['slice-chocolateVariety-add', 'sliced-vanillaVariety-add', 'nonsliced-add'];
    testIdsThatShouldNotExist.forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });

    await act(async () => {
      const valueElement = within(screen.getByTestId('slice-chocolateVariety-elements')).getByTestId('value[x]');
      fireEvent.change(valueElement, {
        target: { value: 'Dark Chocolate' },
      });
    });

    const expectedValue = [
      { url: 'chocolateVariety', valueString: 'Dark Chocolate' },
      { url: 'vanillaVariety', valueString: 'French Vanilla' },
      { url: 'greenVariety', valueString: 'Pistachio' },
    ];

    expect(onChange.mock.calls.length).toBe(1);
    expect(onChange.mock.calls[0][0].length).toBe(expectedValue.length);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(expectedValue));
  });

  test('Hiding non-sliced values', async () => {
    const onChange = jest.fn();

    const nonSliceValue = { url: 'greenVariety', valueString: 'Pistachio' };
    const defaultValue = [
      { url: 'chocolateVariety', valueString: 'Milk Chocolate' },
      { url: 'vanillaVariety', valueString: 'French Vanilla' },
      nonSliceValue,
    ];
    await setup({
      ...defaultProps,
      property: slicedProperty,
      hideNonSliceValues: true,
      defaultValue,
      onChange,
    });

    const testIdsThatShouldExist = [
      'slice-chocolateVariety-elements',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements',
      'slice-vanillaVariety-remove-0',
    ];
    testIdsThatShouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    // Since the property has max: 3, shouldn't be able to add anything
    const testIdsThatShouldNotExist = [
      'slice-chocolateVariety-add',
      'sliced-vanillaVariety-add',
      'nonsliced-add',
      'nonsliced-remove-0',
    ];
    testIdsThatShouldNotExist.forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slice-vanillaVariety-remove-0'));
    });

    // Even though non-sliced values are being hidden, values should be preserved
    const expectedValue = defaultValue.filter((val) => val.url !== 'vanillaVariety');
    expect(expectedValue.length).toBe(defaultValue.length - 1);
    expect(onChange).toHaveBeenCalledWith(expectedValue);
    expect(expectedValue.includes(nonSliceValue)).toBe(true);
  });
});
