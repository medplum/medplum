import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface PatientImmunizationsProps {
  patient: Patient;
}

export function PatientImmunizations(props: PatientImmunizationsProps): JSX.Element {
  const navigate = useNavigate();

  const search: SearchRequest = {
    resourceType: 'Immunization',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` }],
    fields: ['status', 'vaccineCode', 'occurrenceDateTime'],
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
