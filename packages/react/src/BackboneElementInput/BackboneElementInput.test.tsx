import { globalSchema, InternalSchemaElement, TypeInfo } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementInput, BackboneElementInputProps } from './BackboneElementInput';

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
});
