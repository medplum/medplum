// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

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
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
      onChange={(e) => {
        navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`)?.catch(console.error);
      }}
    />
  );
}
