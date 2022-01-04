import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  ContactPoint,
  ElementDefinition,
  HumanName,
  Identifier,
  Period,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourcePropertyInput, ResourcePropertyInputProps } from './ResourcePropertyInput';

const patientNameProperty: ElementDefinition = {
  id: 'Patient.name',
  path: 'Patient.name',
  type: [
    {
      code: 'HumanName',
    },
  ],
  max: '*',
};

const patientActiveProperty: ElementDefinition = {
  id: 'Patient.active',
  path: 'Patient.active',
  type: [
    {
      code: 'boolean',
    },
  ],
};

const patientBirthDateProperty: ElementDefinition = {
  id: 'Patient.birthDate',
  path: 'Patient.birthDate',
  type: [
    {
      code: 'date',
    },
  ],
};

const patientAddressProperty: ElementDefinition = {
  id: 'Patient.address',
  path: 'Patient.address',
  type: [
    {
      code: 'Address',
    },
  ],
  max: '*',
};

const patientPhotoProperty: ElementDefinition = {
  id: 'Patient.photo',
  path: 'Patient.photo',
  type: [
    {
      code: 'Attachment',
    },
  ],
  max: '*',
};

const patientMaritalStatusProperty: ElementDefinition = {
  id: 'Patient.maritalStatus',
  path: 'Patient.maritalStatus',
  type: [
    {
      code: 'CodeableConcept',
    },
  ],
};

const patientTelecomProperty: ElementDefinition = {
  id: 'Patient.telecom',
  path: 'Patient.telecom',
  type: [
    {
      code: 'ContactPoint',
    },
  ],
  max: '*',
};

const patientIdentifierProperty: ElementDefinition = {
  id: 'Patient.identifier',
  path: 'Patient.identifier',
  type: [
    {
      code: 'Identifier',
    },
  ],
  max: '*',
};

const patientManagingOrganizationProperty: ElementDefinition = {
  id: 'Patient.managingOrganization',
  path: 'Patient.managingOrganization',
  type: [
    {
      code: 'Reference',
      targetProfile: ['Organization'],
    },
  ],
};

const observationValueProperty: ElementDefinition = {
  id: 'Observation.value[x]',
  path: 'Observation.value[x]',
  type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'integer' }],
};

const specimenNoteProperty: ElementDefinition = {
  id: 'Specimen.note',
  path: 'Specimen.note',
  type: [
    {
      code: 'Annotation',
    },
  ],
  max: '*',
};

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: patientNameProperty,
        active: patientActiveProperty,
        birthDate: patientBirthDateProperty,
        address: patientAddressProperty,
        photo: patientPhotoProperty,
        maritalStatus: patientMaritalStatusProperty,
        telecom: patientTelecomProperty,
        identifier: patientIdentifierProperty,
        managingOrganization: patientManagingOrganizationProperty,
      },
    },
    Observation: {
      display: 'Observation',
      properties: {
        valueInteger: observationValueProperty,
      },
    },
    Specimen: {
      display: 'Specimen',
      properties: {
        note: specimenNoteProperty,
      },
    },
  },
};

const medplum = new MockClient();

describe('ResourcePropertyInput', () => {
  function setup(props: ResourcePropertyInputProps): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ResourcePropertyInput {...props} />
      </MedplumProvider>
    );
  }

  test('Renders boolean property', () => {
    const onChange = jest.fn();

    setup({
      schema,
      property: patientActiveProperty,
      name: 'active',
      defaultValue: undefined,
      onChange,
    });
    expect(screen.getByTestId('active')).toBeDefined();

    act(() => {
      fireEvent.click(screen.getByTestId('active'));
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('Date property', async () => {
    const onChange = jest.fn();

    setup({
      schema,
      property: {
        type: [
          {
            code: 'date',
          },
        ],
      },
      name: 'date',
      onChange,
    });
    expect(screen.getByTestId('date')).toBeDefined();

    act(() => {
      fireEvent.change(screen.getByTestId('date'), { target: { value: '2021-01-01' } });
    });

    expect(onChange).toHaveBeenCalledWith('2021-01-01');
  });

  test('Date/Time property', async () => {
    const onChange = jest.fn();

    setup({
      schema,
      property: {
        type: [
          {
            code: 'dateTime',
          },
        ],
      },
      name: 'dateTime',
      onChange,
    });
    expect(screen.getByTestId('dateTime')).toBeDefined();

    act(() => {
      fireEvent.change(screen.getByTestId('dateTime'), { target: { value: '2021-01-01T12:00:00Z' } });
    });

    expect(onChange).toHaveBeenCalledWith('2021-01-01T12:00:00Z');
  });

  test('Renders Address property', () => {
    const address: Address[] = [
      {
        city: 'San Francisco',
      },
    ];

    setup({
      schema,
      property: patientAddressProperty,
      name: 'address',
      defaultValue: address,
    });
    expect(screen.getByDisplayValue('San Francisco')).toBeDefined();
  });

  test('Renders Attachment property', async () => {
    const mediaContentProperty: ElementDefinition = {
      id: 'Media.content',
      path: 'Media.content',
      type: [
        {
          code: 'Attachment',
        },
      ],
    };

    const content: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/hello.txt',
      title: 'hello.txt',
    };

    const onChange = jest.fn();

    setup({
      schema,
      property: mediaContentProperty,
      name: 'content',
      defaultValue: content,
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

  test('Renders Attachment array property', async () => {
    const photo: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/hello.txt',
        title: 'hello.txt',
      },
    ];

    const onChange = jest.fn();

    setup({
      schema,
      property: patientPhotoProperty,
      name: 'photo',
      defaultValue: photo,
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

  test('Renders CodeableConcept property', () => {
    const maritalStatus: CodeableConcept = {
      coding: [
        {
          code: 'M',
          display: 'Married',
        },
      ],
    };

    setup({
      schema,
      property: patientMaritalStatusProperty,
      name: 'maritalStatus',
      defaultValue: maritalStatus,
    });
    expect(screen.getByText('Married')).toBeDefined();
  });

  test('Renders HumanName property', () => {
    const name: HumanName[] = [
      {
        family: 'Smith',
      },
    ];

    setup({
      schema,
      property: patientNameProperty,
      name: 'name',
      defaultValue: name,
    });
    expect(screen.getByDisplayValue('Smith')).toBeDefined();
  });

  test('Renders ContactPoint property', () => {
    const telecom: ContactPoint[] = [
      {
        system: 'email',
        value: 'homer@example.com',
      },
    ];

    setup({
      schema,
      property: patientTelecomProperty,
      name: 'telecom',
      defaultValue: telecom,
    });
    expect(screen.getByDisplayValue('email')).toBeDefined();
    expect(screen.getByDisplayValue('homer@example.com')).toBeDefined();
  });

  test('Renders Identifier property', () => {
    const identifier: Identifier[] = [
      {
        system: 'https://example.com',
        value: '123',
      },
    ];

    setup({
      schema,
      property: patientIdentifierProperty,
      name: 'identifier',
      defaultValue: identifier,
    });
    expect(screen.getByDisplayValue('https://example.com')).toBeDefined();
    expect(screen.getByDisplayValue('123')).toBeDefined();
  });

  test('Renders Period property', async () => {
    const period: Period = {
      start: '2020-01-01T12:00:00Z',
      end: '2021-01-02T12:00:00Z',
    };

    const onChange = jest.fn();

    setup({
      schema,
      property: {
        type: [
          {
            code: 'Period',
          },
        ],
      },
      name: 'period',
      defaultValue: period,
      onChange,
    });

    expect(screen.getByPlaceholderText('Start')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('End')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End'), {
        target: { value: '2021-01-03T12:00:00Z' },
      });
    });

    expect(onChange).toHaveBeenCalledWith({ start: '2020-01-01T12:00:00Z', end: '2021-01-03T12:00:00Z' });
  });

  test('Renders Reference property', () => {
    setup({
      schema,
      property: patientManagingOrganizationProperty,
      name: 'managingOrganization',
    });
    expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
  });

  test('Type selector', async () => {
    const onChange = jest.fn();

    setup({
      schema,
      property: observationValueProperty,
      name: 'value[x]',
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
    setup({
      schema,
      property: observationValueProperty,
      name: 'value[x]',
      defaultPropertyType: PropertyType.integer,
    });

    expect(screen.getByDisplayValue('integer')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Quantity')).toBeNull();
  });

  test('Renders Annotation property', () => {
    const note: Annotation[] = [
      {
        text: 'This is a note',
      },
    ];

    setup({
      schema,
      property: specimenNoteProperty,
      name: 'note',
      defaultValue: note,
    });
    expect(screen.getByDisplayValue('This is a note')).toBeDefined();
  });
});
