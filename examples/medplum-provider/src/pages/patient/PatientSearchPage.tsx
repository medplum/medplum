import { Paper } from '@mantine/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, parseSearchRequest, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Loading, MemoizedSearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePatient } from '../../hooks/usePatient';
import { prependPatientPath } from './PatientPage.utils';

export function PatientSearchPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    if (!patient) {
      return;
    }

    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    const populatedSearch = addSearchValues(patient, parsedSearch);

    if (
      location.pathname === `/Patient/${patient.id}/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      navigate(`/Patient/${patient.id}/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, patient, navigate, location]);

  if (!patient || !search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      <MemoizedSearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={(e) => navigate(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onNew={() => {
          navigate(prependPatientPath(patient, `/${search.resourceType}/new`));
        }}
        onChange={(e) => {
          navigate(`/Patient/${patient.id}/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
      />
    </Paper>
  );
}

function addSearchValues(patient: Patient, search: SearchRequest): SearchRequest {
  const resourceType = search.resourceType;
  const fields = search.fields ?? ['_id', '_lastUpdated'];
  const filters = search.filters ?? [];
  const sortRules = search.sortRules;
  const offset = search.offset ?? 0;
  const count = search.count ?? DEFAULT_SEARCH_COUNT;
  return {
    ...search,
    resourceType,
    fields,
    filters,
    sortRules,
    offset,
    count,
  };
}
