import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface PatientObservationsProps {
  patient: Patient;
}

export function PatientObservations(props: PatientObservationsProps): JSX.Element {
  const navigate = useNavigate();

  const search: SearchRequest = {
    resourceType: 'Observation',
    filters: [
      { code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` },
      { code: 'category', operator: Operator.EQUALS, value: 'sdoh' },
    ],
    fields: ['code', 'value[x]'],
  };

  return (
    <SearchControl
      search={search}
      hideFilters={true}
      hideToolbar={true}
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onChange={(e) => {
        navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
      }}
    />
  );
}
