import { Paper } from '@mantine/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, parseSearchRequest, SearchRequest } from '@medplum/core';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import { useResourceType } from '../resource/useResourceType';
import { prependPatientPath } from './PatientPage.utils';

export function PatientSearchPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useResourceType(search?.resourceType, { onInvalidResourceType: () => void navigate('..') });

  useEffect(() => {
    if (!patient) {
      return;
    }

    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    const populatedSearch = addDefaultSearchValues(parsedSearch);

    if (
      location.pathname === `/Patient/${patient.id}/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      void navigate(`/Patient/${patient.id}/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, patient, navigate, location]);

  if (!patient || !search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      <SearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={(e) => void navigate(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onNew={() => {
          void navigate(prependPatientPath(patient, `/${search.resourceType}/new`));
        }}
        onChange={(e) => {
          void navigate(`/Patient/${patient.id}/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
      />
    </Paper>
  );
}

function addDefaultSearchValues(search: SearchRequest): SearchRequest {
  const fields = search.fields ?? ['_id', '_lastUpdated'];
  const offset = search.offset ?? 0;
  const count = search.count ?? DEFAULT_SEARCH_COUNT;
  return {
    ...search,
    fields,
    offset,
    count,
  };
}
