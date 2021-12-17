import { IndexedStructureDefinition } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  ContactPoint,
  ElementDefinition,
  HumanName,
  Identifier,
} from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
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

const medplum = new MockClient({});

describe('ResourcePropertyInput', () => {
  function setup(props: ResourcePropertyInputProps) {
    return render(
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

  test('Renders Attachment property', () => {
    const photo: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/hello.txt',
        title: 'hello.txt',
      },
    ];

    setup({
      schema,
      property: patientPhotoProperty,
      name: 'photo',
      defaultValue: photo,
    });
    expect(screen.getByText('hello.txt')).toBeDefined();
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
