import { PropertyType } from '@medplum/core';
import { MemoizedSmartSearchControl, SmartSearchField } from '@medplum/ui';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const gql = `{
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

const fields: SmartSearchField[] = [
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
    name: 'TESTO Val',
    fhirPath: 'ObservationList.valueQuantity',
    propertyType: PropertyType.Quantity,
  },
  {
    name: 'TESTO Int',
    fhirPath: 'ObservationList.interpretation.coding.display',
    propertyType: PropertyType.string,
  },
  {
    name: 'TESTO Low',
    fhirPath: 'ObservationList.referenceRange.low',
    propertyType: PropertyType.Quantity,
  },
  {
    name: 'TESTO High',
    fhirPath: 'ObservationList.referenceRange.high',
    propertyType: PropertyType.Quantity,
  },
];

export function SmartSearchPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const resourceType = 'ServiceRequest';
  console.log(location);

  return (
    <MemoizedSmartSearchControl
      resourceType={resourceType}
      checkboxesEnabled={true}
      gql={gql}
      fields={fields}
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
      onBulk={(ids: string[]) => {
        navigate(`/bulk/${resourceType}?ids=${ids.join(',')}`);
      }}
    />
  );
}
