import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { JSX } from 'react';
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
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
      onChange={(e) => {
        navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`)?.catch(console.error);
      }}
    />
  );
}
