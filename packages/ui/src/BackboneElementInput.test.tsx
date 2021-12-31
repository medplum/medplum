import { IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementInput, BackboneElementInputProps } from './BackboneElementInput';
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

const valueSetComposeProperty: ElementDefinition = {
  id: 'ValueSet.compose',
  path: 'ValueSet.compose',
  min: 0,
  max: '1',
  base: {
    path: 'ValueSet.compose',
    min: 0,
    max: '1',
  },
  type: [
    {
      code: 'BackboneElement',
    },
  ],
};

const valueSetComposeLockedDateProperty: ElementDefinition = {
  id: 'ValueSet.compose.lockedDate',
  path: 'ValueSet.compose.lockedDate',
  short: 'Locked date',
  min: 0,
  max: '1',
  type: [
    {
      code: 'date',
    },
  ],
};

const valueSetComposeExcludeProperty: ElementDefinition = {
  id: 'ValueSet.compose.exclude',
  path: 'ValueSet.compose.exclude',
  short: 'Explicitly exclude codes from a code system or other value sets',
  min: 0,
  max: '*',
  base: {
    path: 'ValueSet.compose.exclude',
    min: 0,
    max: '*',
  },
  contentReference: '#ValueSet.compose.include',
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
    ValueSet: {
      display: 'Value Set',
      properties: {
        compose: valueSetComposeProperty,
      },
    },
    ValueSetCompose: {
      display: 'Value Set Compose',
      properties: {
        lockedDate: valueSetComposeLockedDateProperty,
        exclude: valueSetComposeExcludeProperty,
      },
    },
  },
};

const medplum = new MockClient();

describe('BackboneElementInput', () => {
  function setup(args: BackboneElementInputProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <BackboneElementInput {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders', () => {
    setup({
      schema,
      property: contactProperty,
      name: 'contact',
    });
    expect(screen.getByText('Name')).toBeDefined();
  });

  test('Handles content reference', () => {
    setup({
      schema,
      property: valueSetComposeProperty,
      name: 'compose',
    });
    expect(screen.getByText('Locked Date')).toBeInTheDocument();
    expect(screen.queryByText('Exclude')).toBeNull();
  });
});
