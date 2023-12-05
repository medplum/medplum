import { Paper } from '@mantine/core';
import { formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  console.log(location);

  useEffect(() => {
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);
    const fields = getDefaultFields(parsedSearch.resourceType);

    const populatedSearch = {
      ...parsedSearch,
      fields,
    };

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
    console.log(populatedSearch);
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper>
      <SearchControl search={search}></SearchControl>
    </Paper>
  );
}

function getDefaultFields(resourceType: string): string[] {
  const fields = ['id', '_lastUpdated'];

  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthdate', 'gender');
      break;
    case 'Task':
      fields.push('priority', 'description', 'for');
      break;
  }

  return fields;
}
