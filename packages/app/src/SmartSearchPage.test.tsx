import { PropertyType } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { FhirPathTableField, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';

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
    name: 'Value',
    fhirPath: 'ObservationList[0].valueQuantity',
    propertyType: PropertyType.Quantity,
  },
  {
    name: 'Interpretation',
    fhirPath: 'ObservationList[0].interpretation.coding.display',
    propertyType: PropertyType.string,
  },
  {
    name: 'Low',
    fhirPath: 'ObservationList[0].referenceRange.low',
    propertyType: PropertyType.Quantity,
  },
  {
    name: ' High',
    fhirPath: 'ObservationList[0].referenceRange.high',
    propertyType: PropertyType.Quantity,
  },
];

let medplum: MockClient;

async function setup(url = '/Patient'): Promise<void> {
  medplum = new MockClient();
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Suspense fallback={<Loading />}>
            <AppRoutes />
          </Suspense>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('SmartSearchPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('Renders success', async () => {
    await setup(`/smart?resourceType=ServiceRequest&query=${query}&fields=${JSON.stringify(fields)}`);
    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
  });

  test('Left click on row', async () => {
    window.open = jest.fn();

    await setup(`/smart?resourceType=ServiceRequest&query=${query}&fields=${JSON.stringify(fields)}`);
    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'));
    });

    // Change the tab
    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Do not open a new browser tab
    expect(window.open).not.toHaveBeenCalled();
  });

  test('Middle click on row', async () => {
    window.open = jest.fn();

    await setup(`/smart?resourceType=ServiceRequest&query=${query}&fields=${JSON.stringify(fields)}`);
    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'), { button: 1 });
    });

    // Should open a new browser tab
    expect(window.open).toHaveBeenCalledWith('/ServiceRequest/123', '_blank');

    // Should still be on the home page
    expect(screen.getByTestId('search-control')).toBeInTheDocument();
  });
});
