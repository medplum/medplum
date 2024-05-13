import { InternalSchemaElement } from '@medplum/core';
import { act, fireEvent, render, screen, within } from '../test-utils/render';
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
  max: 4,
  type: [{ code: 'Extension' }],
  slicing: {
    discriminator: [{ path: 'url', type: 'value' }],
    ordered: false,
    slices: [
      {
        name: 'chocolateVariety',
        path: 'IceCream.flavors',
        definition: 'The type of chocolate you prefer',
        description: 'The type of chocolate you prefer',
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
        max: 2,
        type: [{ code: 'Extension' }],
      },
      {
        name: 'vanillaVariety',
        path: 'IceCream.flavors',
        definition: 'The type of vanilla ice cream you prefer',
        description: 'The type of vanilla ice cream you prefer',
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

const defaultProps: Pick<ResourceArrayInputProps, 'name' | 'path' | 'property' | 'outcome'> = {
  name: 'myProp',
  path: 'Fake.myProp',
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

    expect(screen.getByTitle('Add Test')).toBeInTheDocument();
  });

  test('Renders empty', async () => {
    await setup({
      ...defaultProps,
      defaultValue: [],
    });

    expect(screen.getByTitle('Add Test')).toBeInTheDocument();
  });

  test('Renders elements', async () => {
    await setup({
      ...defaultProps,
      defaultValue: ['foo', 'bar'],
    });

    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
    expect(screen.getByTitle('Add Test')).toBeInTheDocument();
    expect(screen.getAllByTitle('Remove Test')).toHaveLength(2);
  });

  test('Handles non-arrays', async () => {
    await setup({
      ...defaultProps,
      defaultValue: 'x' as unknown as string[],
    });

    expect(screen.getByTitle('Add Test')).toBeInTheDocument();
  });

  test('Click add button', async () => {
    await setup({
      ...defaultProps,
      defaultValue: [],
    });

    expect(screen.getByTitle('Add Test')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Add Test'));
    });

    expect(screen.getByTestId('myProp.0')).toBeInTheDocument();
  });

  test('Click remove button', async () => {
    await setup({
      ...defaultProps,
      defaultValue: ['foo', 'bar'],
    });

    await act(async () => {
      fireEvent.click(screen.getAllByTitle('Remove Test')[0]);
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

    ['slice-chocolateVariety-add', 'slice-vanillaVariety-add', 'nonsliced-add'].forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    [
      'slice-chocolateVariety-elements-0',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements-0',
      'slice-vanillaVariety-remove-0',
      'nonsliced-remove-0',
    ].forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slice-chocolateVariety-add'));
    });

    expect(screen.queryByTestId('slice-chocolateVariety-add')).toBeInTheDocument();
    expect(screen.queryByTestId('slice-chocolateVariety-remove-0')).toBeInTheDocument();
    expect(screen.queryByTestId('slice-chocolateVariety-elements-0')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slice-chocolateVariety-add'));
    });

    expect(screen.queryByTestId('slice-chocolateVariety-add')).toBeNull();
    expect(screen.queryByTestId('slice-chocolateVariety-remove-1')).toBeInTheDocument();
    expect(screen.queryByTestId('slice-chocolateVariety-elements-1')).toBeInTheDocument();
  });

  test('With slices and values in each slice and non-slice values', async () => {
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

    const shouldExist = [
      'slice-chocolateVariety-elements-0',
      'slice-chocolateVariety-remove-0',
      'slice-chocolateVariety-add',
      'slice-vanillaVariety-elements-0',
      'slice-vanillaVariety-remove-0',
      'nonsliced-remove-0',
      'nonsliced-add',
    ];
    shouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    const shouldNotExist = ['sliced-vanillaVariety-add'];
    shouldNotExist.forEach((testId) => {
      expect(screen.queryByTestId(testId)).toBeNull();
    });

    await act(async () => {
      const valueElement = within(screen.getByTestId('slice-chocolateVariety-elements-0')).getByTestId('value[x]');
      fireEvent.change(valueElement, {
        target: { value: 'Dark Chocolate' },
      });
    });

    const expectedValue = [
      { url: 'chocolateVariety', valueString: 'Dark Chocolate' },
      { url: 'vanillaVariety', valueString: 'French Vanilla' },
      { url: 'greenVariety', valueString: 'Pistachio' },
    ];

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expectedValue);
  });

  test('Hiding non-sliced values', async () => {
    const onChange = jest.fn();

    const nonSliceValue = { url: 'greenVariety', valueString: 'Pistachio' };
    const defaultValue = [
      { url: 'chocolateVariety', valueString: 'Milk Chocolate' },
      { url: 'chocolateVariety', valueString: 'White Chocolate' },
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
      'slice-chocolateVariety-elements-0',
      'slice-chocolateVariety-remove-0',
      'slice-vanillaVariety-elements-0',
      'slice-vanillaVariety-remove-0',
    ];
    testIdsThatShouldExist.forEach((testId) => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

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
    const expectedValue = [
      { url: 'chocolateVariety', valueString: 'Milk Chocolate' },
      { url: 'chocolateVariety', valueString: 'White Chocolate' },
      nonSliceValue,
    ];
    expect(expectedValue.length).toBe(defaultValue.length - 1);
    expect(onChange).toHaveBeenCalledWith(expectedValue);
  });
});
