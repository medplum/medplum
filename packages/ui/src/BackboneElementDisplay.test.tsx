import { IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BackboneElementDisplay, BackboneElementDisplayProps } from './BackboneElementDisplay';
import { MedplumProvider } from './MedplumProvider';

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

const deviceNameNameProperty: ElementDefinition = {
  id: 'Device.deviceName.name',
  path: 'Device.deviceName.name',
  type: [
    {
      code: 'string',
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
    DeviceDeviceName: {
      display: 'Device Device Name',
      properties: {
        name: deviceNameNameProperty,
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
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Ignore missing properties', () => {
    setup({
      schema,
      typeName: 'PatientContact',
      value: {
        id: '123',
      },
      ignoreMissingValues: true,
    });
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  test('Renders simple name', () => {
    setup({
      schema,
      typeName: 'DeviceDeviceName',
      value: {
        name: 'Simple Name',
      },
    });
    expect(screen.getByText('Simple Name')).toBeInTheDocument();
  });

  test('Not implemented', () => {
    setup({
      schema,
      typeName: 'Foo',
      value: {
        foo: 'bar',
      },
    });
    expect(screen.getByText('Foo not implemented')).toBeInTheDocument();
  });
});
