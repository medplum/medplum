import { globalSchema, indexStructureDefinitionBundle, InternalSchemaElement, TypeInfo } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementInput, BackboneElementInputProps } from './BackboneElementInput';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const valueSetComposeProperty: InternalSchemaElement = {
  path: 'ValueSet.compose',
  description: 'Include or exclude codes from a code system or other value sets',
  min: 0,
  max: 1,
  type: [
    {
      code: 'BackboneElement',
    },
  ],
};

const valueSetComposeLockedDateProperty: InternalSchemaElement = {
  path: 'ValueSet.compose.lockedDate',
  description: 'Locked date',
  min: 0,
  max: 1,
  type: [
    {
      code: 'date',
    },
  ],
};

const valueSetComposeExcludeProperty: InternalSchemaElement = {
  path: 'ValueSet.compose.exclude',
  description: 'Explicitly exclude codes from a code system or other value sets',
  min: 0,
  max: Infinity,
  type: [
    {
      code: 'ValueSetComposeInclude',
    },
  ],
};

globalSchema.types['ValueSet'] = {
  display: 'Value Set',
  properties: {
    compose: valueSetComposeProperty,
  },
} as unknown as TypeInfo;

globalSchema.types['ValueSetCompose'] = {
  display: 'Value Set Compose',
  properties: {
    lockedDate: valueSetComposeLockedDateProperty,
    exclude: valueSetComposeExcludeProperty,
  },
} as unknown as TypeInfo;

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

  function readJson(testFilename: string): any {
    return JSON.parse(readFileSync(resolve('src', '__test__', testFilename), 'utf8'));
  }

  test('Profile', async () => {
    const fishPatientProfile = readJson('StructureDefinition-fish-patient.json');
    const fishSpeciesProfile = readJson('StructureDefinition-fish-species.json');
    for (const profile of [fishPatientProfile, fishSpeciesProfile]) {
      indexStructureDefinitionBundle([profile], profile.url);
    }
    await setup({
      typeName: fishPatientProfile.name,
      profileUrl: fishPatientProfile.url,
    });

    // Name is required
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(within(screen.getByText('Name')).getByText('*')).toBeInTheDocument();

    // Marital Status and Communication eliminated
    expect(screen.queryByText('Marital Status')).toBeNull();
    expect(screen.queryByText('Communication')).toBeNull();

    // Fish Patient has an extension defined as shown below; the sliceName and definition appear in the form
    /*{
      "id": "Patient.extension:species",
      "path": "Patient.extension",
      "sliceName": "species",
      "definition": "The species of the fish.",
      ...
    }*/
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('The species of the fish.')).toBeInTheDocument();
  });
});
