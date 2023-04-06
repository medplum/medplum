import { PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  ContactPoint,
  ElementDefinition,
  Extension,
  HumanName,
  Identifier,
  Period,
  Quantity,
  Range,
  Ratio,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { convertIsoToLocal, convertLocalToIso } from '../DateTimeInput/DateTimeInput';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { ResourcePropertyInput, ResourcePropertyInputProps } from './ResourcePropertyInput';

const medplum = new MockClient();

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
    const property: ElementDefinition = {
      type: [
        {
          code: 'boolean',
        },
      ],
    };

    const onChange = jest.fn();

    await setup({
      name: 'active',
      property,
      onChange,
    });
    expect(screen.getByTestId('active')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('active'));
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('Date property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'date',
        },
      ],
    };

    const onChange = jest.fn();

    await setup({
      name: 'date',
      property,
      onChange,
    });
    expect(screen.getByTestId('date')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('date'), { target: { value: '2021-01-01' } });
    });

    expect(onChange).toHaveBeenCalledWith('2021-01-01');
  });

  test('Date/Time property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'dateTime',
        },
      ],
    };

    const onChange = jest.fn();
    const localString = convertIsoToLocal('2021-01-01T12:00:00Z');
    const isoString = convertLocalToIso(localString);

    await setup({
      name: 'dateTime',
      property,
      onChange,
    });
    expect(screen.getByTestId('dateTime')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('dateTime'), { target: { value: localString } });
    });

    expect(onChange).toHaveBeenCalledWith(isoString);
  });

  test('Markdown property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'markdown',
        },
      ],
    };

    const onChange = jest.fn();

    await setup({
      name: 'markdown',
      property,
      onChange,
    });
    expect(screen.getByTestId('markdown')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByTestId('markdown'), { target: { value: 'xyz' } });
    });

    expect(onChange).toHaveBeenCalledWith('xyz');
  });

  // 2.24.0.2 Complex Types
  // https://www.hl7.org/fhir/datatypes.html#complex

  test('Address property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Address',
        },
      ],
      max: '*',
    };

    const defaultValue: Address[] = [
      {
        city: 'San Francisco',
      },
    ];

    await setup({
      name: 'address',
      property,
      defaultValue,
    });
    expect(screen.getByDisplayValue('San Francisco')).toBeDefined();
  });

  test('Annotation property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Annotation',
        },
      ],
      max: '*',
    };

    const defaultValue: Annotation[] = [
      {
        text: 'This is a note',
      },
    ];

    await setup({
      name: 'note',
      property,
      defaultValue,
    });
    expect(screen.getByDisplayValue('This is a note')).toBeDefined();
  });

  test('Attachment property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Attachment',
        },
      ],
    };

    const defaultValue: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/hello.txt',
      title: 'hello.txt',
    };

    const onChange = jest.fn();

    await setup({
      name: 'content',
      property,
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

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'world.txt' }));
  });

  test('Attachment array property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Attachment',
        },
      ],
      max: '*',
    };

    const defaultValue: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/hello.txt',
        title: 'hello.txt',
      },
    ];

    const onChange = jest.fn();

    await setup({
      name: 'photo',
      property,
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
    const property: ElementDefinition = {
      type: [
        {
          code: 'CodeableConcept',
        },
      ],
    };

    const defaultValue: CodeableConcept = {
      coding: [
        {
          code: 'M',
          display: 'Married',
        },
      ],
    };

    await setup({
      name: 'maritalStatus',
      property,
      defaultValue,
    });
    expect(screen.getByText('Married')).toBeDefined();
  });

  test('ContactPoint property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'ContactPoint',
        },
      ],
      max: '*',
    };

    const defaultValue: ContactPoint[] = [
      {
        system: 'email',
        value: 'homer@example.com',
      },
    ];

    await setup({
      name: 'telecom',
      property,
      defaultValue,
    });
    expect(screen.getByDisplayValue('email')).toBeDefined();
    expect(screen.getByDisplayValue('homer@example.com')).toBeDefined();
  });

  test('Extension property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Extension',
        },
      ],
      max: '*',
    };

    const defaultValue: Extension[] = [
      {
        url: 'https://example.com',
        valueString: 'foo',
      },
    ];

    const onChange = jest.fn();

    await setup({
      name: 'extension',
      property,
      defaultValue,
      onChange,
    });

    const el = screen.getByDisplayValue('{"url":"https://example.com","valueString":"foo"}');
    expect(el).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(el, { target: { value: '{"url":"https://example.com","valueString":"bar"}' } });
    });

    expect(onChange).toHaveBeenCalledWith([{ url: 'https://example.com', valueString: 'bar' }]);
  });

  test('HumanName property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'HumanName',
        },
      ],
      max: '*',
    };

    const defaultValue: HumanName[] = [
      {
        family: 'Smith',
      },
    ];

    await setup({
      name: 'name',
      property,
      defaultValue,
    });
    expect(screen.getByDisplayValue('Smith')).toBeDefined();
  });

  test('Identifier property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Identifier',
        },
      ],
      max: '*',
    };

    const defaultValue: Identifier[] = [
      {
        system: 'https://example.com',
        value: '123',
      },
    ];

    const onChange = jest.fn();

    await setup({
      name: 'identifier',
      property,
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
    const property: ElementDefinition = {
      type: [
        {
          code: 'Period',
        },
      ],
    };

    const defaultValue: Period = {
      start: '2020-01-01T12:00:00.000Z',
      end: '2021-01-02T12:00:00.000Z',
    };

    const onChange = jest.fn();

    await setup({
      name: 'period',
      property,
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

    expect(onChange).toHaveBeenCalledWith({ start: '2020-01-01T12:00:00.000Z', end: '2021-01-03T12:00:00.000Z' });
  });

  test('Quantity property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Quantity',
        },
      ],
    };

    const defaultValue: Quantity = {
      value: 1,
      unit: 'mg',
    };

    const onChange = jest.fn();

    await setup({
      name: 'test',
      property,
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

    expect(onChange).toHaveBeenCalledWith({ value: 2, unit: 'mg' });
  });

  test('Range property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Range',
        },
      ],
    };

    const defaultValue: Range = {
      low: { value: 5, unit: 'mg' },
      high: { value: 10, unit: 'mg' },
    };

    const onChange = jest.fn();

    await setup({
      name: 'test',
      property,
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

    expect(onChange).toHaveBeenCalledWith({
      low: { value: 2, unit: 'mg' },
      high: { value: 10, unit: 'mg' },
    });
  });

  test('Ratio property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Ratio',
        },
      ],
    };

    const defaultValue: Ratio = {
      numerator: { value: 5, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    };

    const onChange = jest.fn();

    await setup({
      name: 'test',
      property,
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

    expect(onChange).toHaveBeenCalledWith({
      numerator: { value: 2, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    });
  });

  test('Reference property', async () => {
    const property: ElementDefinition = {
      type: [
        {
          code: 'Reference',
          targetProfile: ['Organization'],
        },
      ],
    };

    await setup({
      name: 'managingOrganization',
      property,
    });

    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
    expect(comboboxes[0]).toBeInstanceOf(HTMLSelectElement);
    expect(comboboxes[1]).toBeInstanceOf(HTMLInputElement);
  });

  test('Type selector', async () => {
    const property: ElementDefinition = {
      type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'integer' }],
    };

    const onChange = jest.fn();

    await setup({
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
    const property: ElementDefinition = {
      type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'integer' }],
    };

    await setup({
      name: 'value[x]',
      property,
      defaultPropertyType: PropertyType.integer,
    });

    expect(screen.getByDisplayValue('integer')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Quantity')).toBeNull();
  });
});
