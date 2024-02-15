import { InternalSchemaElement, PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  ContactPoint,
  Extension,
  HumanName,
  Identifier,
  Period,
  Quantity,
  Range,
  Ratio,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { convertIsoToLocal, convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ResourcePropertyInput, ResourcePropertyInputProps } from './ResourcePropertyInput';

const medplum = new MockClient();

const baseProperty: Omit<InternalSchemaElement, 'type'> = {
  min: 0,
  max: 1,
  description: '',
  isArray: false,
  constraints: [],
  path: '',
};

const defaultProps: Pick<ResourcePropertyInputProps, 'path' | 'defaultValue' | 'outcome' | 'onChange'> = {
  path: 'Resource.path',
  defaultValue: undefined,
  outcome: undefined,
  onChange: undefined,
};

describe('ResourcePropertyInput', () => {
  async function setup(props: ResourcePropertyInputProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ResourcePropertyInput {...props} />
        </MedplumProvider>
      );
    });
  }

  // 2.24.0.1 Primitive Types
  // https://www.hl7.org/fhir/datatypes.html#primitive

  test('boolean property', async () => {
    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'active',
      property: { ...baseProperty, type: [{ code: 'boolean' }] },
      onChange,
    });
    expect(screen.getByTestId('active')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('active'));
    });

    expect(onChange).toHaveBeenCalledWith(true, 'active');
  });

  test('Date property', async () => {
    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'date',
      property: { ...baseProperty, type: [{ code: 'date' }] },
      onChange,
    });
    expect(screen.getByTestId('date')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('date'), { target: { value: '2021-01-01' } });
    });

    expect(onChange).toHaveBeenCalledWith('2021-01-01', 'date');
  });

  test('Date/Time property', async () => {
    const onChange = jest.fn();
    const localString = convertIsoToLocal('2021-01-01T12:00:00Z');
    const isoString = convertLocalToIso(localString);

    await setup({
      ...defaultProps,
      name: 'dateTime',
      property: { ...baseProperty, type: [{ code: 'dateTime' }] },
      onChange,
    });
    expect(screen.getByTestId('dateTime')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('dateTime'), { target: { value: localString } });
    });

    expect(onChange).toHaveBeenCalledWith(isoString, 'dateTime');
  });

  test('Markdown property', async () => {
    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'markdown',
      property: { ...baseProperty, type: [{ code: 'markdown' }] },
      onChange,
    });
    expect(screen.getByTestId('markdown')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('markdown'), { target: { value: 'xyz' } });
    });

    expect(onChange).toHaveBeenCalledWith('xyz', 'markdown');
  });

  // 2.24.0.2 Complex Types
  // https://www.hl7.org/fhir/datatypes.html#complex

  test('Address property', async () => {
    const defaultValue: Address[] = [
      {
        city: 'San Francisco',
      },
    ];

    await setup({
      ...defaultProps,
      name: 'address',
      property: { ...baseProperty, type: [{ code: 'Address' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
    });
    expect(screen.getByDisplayValue('San Francisco')).toBeDefined();
  });

  test('Annotation property', async () => {
    const defaultValue: Annotation[] = [
      {
        text: 'This is a note',
      },
    ];

    await setup({
      ...defaultProps,
      name: 'note',
      property: { ...baseProperty, type: [{ code: 'Annotation' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
    });
    expect(screen.getByDisplayValue('This is a note')).toBeDefined();
  });

  test('Attachment property', async () => {
    const defaultValue: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/hello.txt',
      title: 'hello.txt',
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'content',
      property: { ...baseProperty, type: [{ code: 'Attachment' }] },
      defaultValue,
      onChange,
    });
    expect(screen.getByText('hello.txt')).toBeDefined();

    // Remove the original file
    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    // Add a new file
    await act(async () => {
      const files = [new File(['hello'], 'world.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'world.txt' }), 'content');
  });

  test('Attachment array property', async () => {
    const defaultValue: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/hello.txt',
        title: 'hello.txt',
      },
    ];

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'photo',
      property: { ...baseProperty, type: [{ code: 'Attachment' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
      onChange,
    });
    expect(screen.getByText('hello.txt')).toBeDefined();

    await act(async () => {
      const files = [new File(['hello'], 'world.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'hello.txt' }),
        expect.objectContaining({ title: 'world.txt' }),
      ])
    );
  });

  test('CodeableConcept property', async () => {
    const defaultValue: CodeableConcept = {
      coding: [
        {
          code: 'M',
          display: 'Married',
        },
      ],
    };

    await setup({
      ...defaultProps,
      name: 'maritalStatus',
      property: { ...baseProperty, type: [{ code: 'CodeableConcept' }] },
      defaultValue,
    });
    expect(screen.getByText('Married')).toBeDefined();
  });

  test('ContactPoint property', async () => {
    const defaultValue: ContactPoint[] = [
      {
        system: 'email',
        value: 'homer@example.com',
      },
    ];

    await setup({
      ...defaultProps,
      name: 'telecom',
      property: { ...baseProperty, type: [{ code: 'ContactPoint' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
    });
    expect(screen.getByDisplayValue('email')).toBeDefined();
    expect(screen.getByDisplayValue('homer@example.com')).toBeDefined();
  });

  test('Extension property', async () => {
    const defaultValue: Extension[] = [
      {
        url: 'https://example.com',
        valueString: 'foo',
      },
    ];

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'extension',
      property: { ...baseProperty, type: [{ code: 'Extension' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
      onChange,
    });

    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
    const el = screen.getByDisplayValue('foo');
    expect(el).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(el, { target: { value: 'new value' } });
    });

    expect(onChange).toHaveBeenCalledWith([{ url: 'https://example.com', valueString: 'new value' }]);
  });

  test('HumanName property', async () => {
    const defaultValue: HumanName[] = [
      {
        family: 'Smith',
      },
    ];

    await setup({
      ...defaultProps,
      name: 'name',
      property: { ...baseProperty, type: [{ code: 'HumanName' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
    });
    expect(screen.getByDisplayValue('Smith')).toBeDefined();
  });

  test('Identifier property', async () => {
    const defaultValue: Identifier[] = [
      {
        system: 'https://example.com',
        value: '123',
      },
    ];

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'identifier',
      property: { ...baseProperty, type: [{ code: 'Identifier' }], max: Number.POSITIVE_INFINITY },
      defaultValue,
      onChange,
    });
    expect(screen.getByDisplayValue('https://example.com')).toBeDefined();
    expect(screen.getByDisplayValue('123')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('123'), {
        target: { value: '456' },
      });
    });

    expect(onChange).toHaveBeenCalledWith([{ system: 'https://example.com', value: '456' }]);
  });

  test('Period property', async () => {
    const defaultValue: Period = {
      start: '2020-01-01T12:00:00.000Z',
      end: '2021-01-02T12:00:00.000Z',
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'period',
      property: { ...baseProperty, type: [{ code: 'Period' }] },
      defaultValue,
      onChange,
    });

    expect(screen.getByPlaceholderText('Start')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('End')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End'), {
        target: { value: '2021-01-03T12:00:00.000Z' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(
      { start: '2020-01-01T12:00:00.000Z', end: '2021-01-03T12:00:00.000Z' },
      'period'
    );
  });

  test('Quantity property', async () => {
    const defaultValue: Quantity = {
      value: 1,
      unit: 'mg',
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'test',
      property: { ...baseProperty, type: [{ code: 'Quantity' }] },
      defaultValue,
      onChange,
    });

    expect(screen.getByPlaceholderText('Value')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Unit')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '2' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({ value: 2, unit: 'mg' }, 'test');
  });

  test('Range property', async () => {
    const defaultValue: Range = {
      low: { value: 5, unit: 'mg' },
      high: { value: 10, unit: 'mg' },
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'test',
      property: { ...baseProperty, type: [{ code: 'Range' }] },
      defaultValue,
      onChange,
    });

    expect(screen.getAllByPlaceholderText('Value').length).toBe(2);
    expect(screen.getAllByPlaceholderText('Unit').length).toBe(2);

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Value')[0], {
        target: { value: '2' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(
      {
        low: { value: 2, unit: 'mg' },
        high: { value: 10, unit: 'mg' },
      },
      'test'
    );
  });

  test('Ratio property', async () => {
    const defaultValue: Ratio = {
      numerator: { value: 5, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'test',
      property: { ...baseProperty, type: [{ code: 'Ratio' }] },
      defaultValue,
      onChange,
    });

    expect(screen.getAllByPlaceholderText('Value').length).toBe(2);
    expect(screen.getAllByPlaceholderText('Unit').length).toBe(2);

    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText('Value')[0], {
        target: { value: '2' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(
      {
        numerator: { value: 2, unit: 'mg' },
        denominator: { value: 10, unit: 'ml' },
      },
      'test'
    );
  });

  test('Reference property single target type', async () => {
    const property: InternalSchemaElement = {
      ...baseProperty,
      type: [
        {
          code: 'Reference',
          targetProfile: ['Organization'],
        },
      ],
    };

    await setup({
      ...defaultProps,
      name: 'managingOrganization',
      property,
    });

    const comboboxes = screen.queryAllByRole('combobox');
    expect(comboboxes).toHaveLength(0);

    const searchBoxes = screen.getAllByRole('searchbox');
    expect(searchBoxes).toHaveLength(1);
    expect(searchBoxes[0]).toBeInstanceOf(HTMLInputElement);
  });

  test('Reference property multiple target types', async () => {
    const property: InternalSchemaElement = {
      ...baseProperty,
      type: [
        {
          code: 'Reference',
          targetProfile: ['Patient', 'Practitioner'],
        },
      ],
    };

    await setup({
      ...defaultProps,
      name: 'subject',
      property,
      defaultValue: { reference: 'Patient/123' },
    });

    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(1);
    expect(comboboxes[0]).toBeInstanceOf(HTMLSelectElement);

    const searchBoxes = screen.queryAllByRole('searchbox');
    expect(searchBoxes).toHaveLength(0);
  });

  test('Type selector', async () => {
    const property: InternalSchemaElement = {
      ...baseProperty,
      type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'integer' }],
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'value[x]',
      property,
      onChange,
    });

    // The first property type is the default
    expect(screen.getByDisplayValue('Quantity')).toBeDefined();

    // Set a quantity value
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: '123' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({ value: 123 }, 'valueQuantity');
    onChange.mockClear();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Unit'), {
        target: { value: 'mg' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({ value: 123, unit: 'mg' }, 'valueQuantity');
    onChange.mockClear();

    // Change to string
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Quantity'), {
        target: { value: 'string' },
      });
    });
    expect(screen.getByDisplayValue('string')).toBeDefined();
    expect(screen.getByTestId('value[x]')).toBeDefined();

    // Set a string value
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), {
        target: { value: 'hello' },
      });
    });

    expect(onChange).toHaveBeenCalledWith('hello', 'valueString');
    onChange.mockClear();

    // Change to integer
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('string'), {
        target: { value: 'integer' },
      });
    });
    expect(screen.getByDisplayValue('integer')).toBeDefined();
    expect(screen.getByTestId('value[x]')).toBeDefined();

    // Set an integer value
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), {
        target: { value: '123' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(123, 'valueInteger');
    onChange.mockClear();
  });

  test('Type selector default value', async () => {
    const property: InternalSchemaElement = {
      ...baseProperty,
      type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'integer' }],
    };

    await setup({
      ...defaultProps,
      name: 'value[x]',
      property,
      defaultPropertyType: PropertyType.integer,
    });

    expect(screen.getByDisplayValue('integer')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Quantity')).toBeNull();
  });

  test('Project secrets', async () => {
    const property: InternalSchemaElement = {
      ...baseProperty,
      path: 'Project.secret.value[x]',
      type: [{ code: 'string' }],
    };

    const onChange = jest.fn();

    await setup({
      ...defaultProps,
      name: 'secret',
      path: property.path,
      property,
      onChange,
    });

    const input = screen.getByTestId('secret');
    expect(input).toBeInTheDocument();

    expect(screen.getByTitle('Copy secret')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'hello' } });
    });

    expect(onChange).toHaveBeenCalledWith('hello', 'secret');
  });
});
