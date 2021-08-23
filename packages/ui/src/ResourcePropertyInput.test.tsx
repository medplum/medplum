import { Address, Attachment, CodeableConcept, ContactPoint, ElementDefinition, HumanName, Identifier, IndexedStructureDefinition, MedplumClient } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourcePropertyInput, ResourcePropertyInputProps } from './ResourcePropertyInput';

const patientNameProperty: ElementDefinition = {
  id: 'Patient.name',
  path: 'Patient.name',
  type: [{
    code: 'HumanName'
  }],
  max: '*'
};

const patientBirthDateProperty: ElementDefinition = {
  id: 'Patient.birthDate',
  path: 'Patient.birthDate',
  type: [{
    code: 'date'
  }]
};

const patientAddressProperty: ElementDefinition = {
  id: 'Patient.address',
  path: 'Patient.address',
  type: [{
    code: 'Address'
  }],
  max: '*'
};

const patientPhotoProperty: ElementDefinition = {
  id: 'Patient.photo',
  path: 'Patient.photo',
  type: [{
    code: 'Attachment'
  }],
  max: '*'
};

const patientMaritalStatusProperty: ElementDefinition = {
  id: 'Patient.maritalStatus',
  path: 'Patient.maritalStatus',
  type: [{
    code: 'CodeableConcept'
  }]
};

const patientTelecomProperty: ElementDefinition = {
  id: 'Patient.telecom',
  path: 'Patient.telecom',
  type: [{
    code: 'ContactPoint'
  }],
  max: '*'
};

const patientIdentifierProperty: ElementDefinition = {
  id: 'Patient.identifier',
  path: 'Patient.identifier',
  type: [{
    code: 'Identifier'
  }],
  max: '*'
};

const patientManagingOrganizationProperty: ElementDefinition = {
  id: 'Patient.managingOrganization',
  path: 'Patient.managingOrganization',
  type: [{
    code: 'Reference',
    targetProfile: ['Organization']
  }]
};

const observationValueProperty: ElementDefinition = {
  id: 'Observation.value[x]',
  path: 'Observation.value[x]',
  type: [{
    code: 'integer'
  }]
};

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: patientNameProperty,
        birthDate: patientBirthDateProperty,
        address: patientAddressProperty,
        photo: patientPhotoProperty,
        maritalStatus: patientMaritalStatusProperty,
        telecom: patientTelecomProperty,
        identifier: patientIdentifierProperty,
        managingOrganization: patientManagingOrganizationProperty,
      }
    },
    Observation: {
      display: 'Observation',
      properties: {
        valueInteger: observationValueProperty
      }
    }
  }
};

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options
    }
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('ResourcePropertyInput', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  function setup(props: ResourcePropertyInputProps) {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <ResourcePropertyInput {...props} />
      </MedplumProvider>
    );
  }

  test('Renders Address property', () => {
    const address: Address[] = [{
      city: 'San Francisco'
    }];

    setup({
      schema,
      property: patientAddressProperty,
      name: 'address',
      defaultValue: address
    });
    expect(screen.getByDisplayValue('San Francisco')).not.toBeUndefined();
  });

  test('Renders Attachment property', () => {
    const photo: Attachment[] = [{
      contentType: 'text/plain',
      url: 'https://example.com/hello.txt'
    }];

    setup({
      schema,
      property: patientPhotoProperty,
      name: 'photo',
      defaultValue: photo
    });
    expect(screen.getByText('text/plain')).not.toBeUndefined();
  });

  test('Renders CodeableConcept property', () => {
    const maritalStatus: CodeableConcept = {
      coding: [{
        code: 'M'
      }]
    };

    setup({
      schema,
      property: patientMaritalStatusProperty,
      name: 'maritalStatus',
      defaultValue: maritalStatus
    });
    expect(screen.getByDisplayValue('M')).not.toBeUndefined();
  });

  test('Renders HumanName property', () => {
    const name: HumanName[] = [{
      family: 'Smith'
    }];

    setup({
      schema,
      property: patientNameProperty,
      name: 'name',
      defaultValue: name
    });
    expect(screen.getByDisplayValue('Smith')).not.toBeUndefined();
  });

  test('Renders ContactPoint property', () => {
    const telecom: ContactPoint[] = [{
      system: 'email',
      value: 'homer@example.com'
    }];

    setup({
      schema,
      property: patientTelecomProperty,
      name: 'telecom',
      defaultValue: telecom
    });
    expect(screen.getByDisplayValue('email')).not.toBeUndefined();
    expect(screen.getByDisplayValue('homer@example.com')).not.toBeUndefined();
  });

  test('Renders Identifier property', () => {
    const identifier: Identifier[] = [{
      system: 'https://example.com',
      value: '123'
    }];

    setup({
      schema,
      property: patientIdentifierProperty,
      name: 'identifier',
      defaultValue: identifier
    });
    expect(screen.getByDisplayValue('https://example.com')).not.toBeUndefined();
    expect(screen.getByDisplayValue('123')).not.toBeUndefined();
  });

  test('Renders Reference property', () => {
    setup({
      schema,
      property: patientManagingOrganizationProperty,
      name: 'managingOrganization'
    });
    expect(screen.getByTestId('autocomplete')).not.toBeUndefined();
  });

});
