import { PropertyType } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { FhirPathTable, FhirPathTableField, FhirPathTableProps } from './FhirPathTable';

const query = `{
  ResourceList: ServiceRequestList {
    id,
    subject {
      display,
      reference
    },
    code {
      coding {
        code
      }
    },
    ObservationList(_reference: based_on) {
      id,
      code {
        coding {
          code
        }
      },
      valueString,
      valueQuantity {
        value,
        unit
      }
      interpretation {
        coding {
          system,
          code,
          display
        }
      },
      referenceRange {
        low {
          value,
          unit
        },
        high {
          value,
          unit
        }
      }
    }
  }
  }`;

const fields: FhirPathTableField[] = [
  {
    name: 'ID',
    fhirPath: 'id',
    propertyType: PropertyType.string,
  },
  {
    name: 'Code',
    fhirPath: 'code.coding.code',
    propertyType: PropertyType.string,
  },
  {
    name: 'Patient',
    fhirPath: 'subject.display',
    propertyType: PropertyType.string,
  },
  {
    name: 'Val',
    fhirPath: 'ObservationList[0].valueQuantity',
    propertyType: PropertyType.Quantity,
  },
  {
    name: 'Int',
    fhirPath: 'ObservationList[0].interpretation.coding.display',
    propertyType: PropertyType.string,
  },
  {
    name: 'Low',
    fhirPath: 'ObservationList[0].referenceRange.low',
    propertyType: PropertyType.Quantity,
  },
  {
    name: 'High',
    fhirPath: 'ObservationList[0].referenceRange.high',
    propertyType: PropertyType.Quantity,
  },
];

describe('FhirPathTable', () => {
  async function setup(args: FhirPathTableProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={new MockClient()}>
            <FhirPathTable {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders results', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders with checkboxes', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Bulk button', async () => {
    const onBulk = jest.fn();

    await setup({
      resourceType: 'ServiceRequest',
      query,
      fields,
      onBulk,
    });

    await act(async () => {
      expect(await screen.findByText('Bulk...')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Bulk...'));
    });

    expect(onBulk).toHaveBeenCalled();
  });

  test('Click on row', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(props.onClick).toHaveBeenCalled();
    expect(props.onAuxClick).not.toHaveBeenCalled();
  });

  test('Aux click on row', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
      onClick: jest.fn(),
      onAuxClick: jest.fn(),
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0], { button: 1 });
    });

    expect(props.onClick).not.toHaveBeenCalled();
    expect(props.onAuxClick).toHaveBeenCalled();
  });

  test('Click all checkbox', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('all-checkbox'));
    });

    const allCheckbox = screen.getByTestId('all-checkbox');
    expect(allCheckbox).toBeDefined();
    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);

    const rowCheckboxes = screen.queryAllByTestId('row-checkbox');
    expect(rowCheckboxes).toBeDefined();
    expect(rowCheckboxes.length).toEqual(1);
    expect((rowCheckboxes[0] as HTMLInputElement).checked).toEqual(true);
  });

  test('Click row checkbox', async () => {
    const props = {
      resourceType: 'ServiceRequest',
      query,
      fields,
      checkboxesEnabled: true,
    };

    await setup(props);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    const allCheckbox = screen.getByTestId('all-checkbox');
    const rowCheckbox = screen.getByTestId('row-checkbox');

    await act(async () => {
      fireEvent.click(rowCheckbox);
    });

    expect((allCheckbox as HTMLInputElement).checked).toEqual(true);
    expect((rowCheckbox as HTMLInputElement).checked).toEqual(true);

    await act(async () => {
      fireEvent.click(rowCheckbox);
    });

    expect((allCheckbox as HTMLInputElement).checked).toEqual(false);
    expect((rowCheckbox as HTMLInputElement).checked).toEqual(false);
  });
});
