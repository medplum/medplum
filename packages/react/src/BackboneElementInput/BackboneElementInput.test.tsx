import { globalSchema, TypeSchema } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementInput, BackboneElementInputProps } from './BackboneElementInput';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';

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

globalSchema.types['ValueSet'] = {
  display: 'Value Set',
  properties: {
    compose: valueSetComposeProperty,
  },
} as unknown as TypeSchema;

globalSchema.types['ValueSetCompose'] = {
  display: 'Value Set Compose',
  properties: {
    lockedDate: valueSetComposeLockedDateProperty,
    exclude: valueSetComposeExcludeProperty,
  },
} as unknown as TypeSchema;

const medplum = new MockClient();

describe('BackboneElementInput', () => {
  async function setup(args: BackboneElementInputProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <BackboneElementInput {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders', async () => {
    await medplum.requestSchema('Patient');
    await setup({ typeName: 'PatientContact' });
    expect(screen.getByText('Name')).toBeDefined();
  });

  test('Handles content reference', async () => {
    await medplum.requestSchema('ValueSet');
    await setup({ typeName: 'ValueSetCompose' });
    expect(screen.getByText('Locked Date')).toBeInTheDocument();
    expect(screen.getByText('Exclude')).toBeInTheDocument();
  });

  test('Not implemented', async () => {
    await setup({ typeName: 'Foo' });
    expect(screen.getByText('Foo not implemented')).toBeInTheDocument();
  });
});
