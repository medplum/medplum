import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router';

interface PatientConsentsProps {
  patient: Patient;
}

export function PatientConsents(props: PatientConsentsProps): JSX.Element {
  const navigate = useNavigate();

  const search: SearchRequest = {
    resourceType: 'Consent',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` }],
    fields: ['status', 'scope', 'category'],
  };

  return (
    <SearchControl
      search={search}
      hideFilters={true}
      hideToolbar={true}
      onClick={(e) => void navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onChange={(e) => {
        void navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
      }}
    />
  );
}
