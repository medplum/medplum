import { ElementDefinition, IndexedStructureDefinition, MedplumClient } from '@medplum/core';
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
        birthDate: patientBirthDateProperty
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

  test('Renders HumanName property', () => {
    setup({
      schema,
      property: patientNameProperty,
      name: 'foo',
      defaultValue: [{ family: 'Smith' }]
    });
    expect(screen.getByDisplayValue('Smith')).not.toBeUndefined();
  });

});
