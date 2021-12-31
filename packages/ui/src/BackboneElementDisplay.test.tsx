import { IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementDisplay, BackboneElementDisplayProps } from './BackboneElementDisplay';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from '@medplum/mock';

const contactProperty: ElementDefinition = {
  id: 'Patient.contact',
  path: 'Patient.contact',
  type: [
    {
      code: 'BackboneElement',
    },
  ],
  min: 0,
  max: '*',
};

const idProperty: ElementDefinition = {
  id: 'Patient.contact.id',
  path: 'Patient.contact.id',
  type: [
    {
      code: 'string',
    },
  ],
  min: 0,
  max: '1',
};

const nameProperty: ElementDefinition = {
  id: 'Patient.contact.name',
  path: 'Patient.contact.name',
  type: [
    {
      code: 'HumanName',
    },
  ],
  min: 0,
  max: '1',
};

const schema: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        contact: contactProperty,
      },
    },
    PatientContact: {
      display: 'Patient Contact',
      properties: {
        id: idProperty,
        name: nameProperty,
      },
    },
  },
};

const medplum = new MockClient();

describe('BackboneElementDisplay', () => {
  function setup(args: BackboneElementDisplayProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <BackboneElementDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders null', () => {
    setup({
      schema,
      typeName: 'PatientContact',
      value: null,
    });
  });

  test('Renders value', () => {
    setup({
      schema,
      typeName: 'PatientContact',
      value: {
        id: '123',
        name: {
          given: ['John'],
          family: 'Doe',
        },
      },
    });
    expect(screen.getByText('Name')).toBeDefined();
  });
});
