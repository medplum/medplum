import { Paper } from '@mantine/core';
import { formatSearchQuery, getReferenceString, parseSearchDefinition, SearchRequest, SortRule } from '@medplum/core';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    // Parse the search definition from the url and get the correct fields for the resource type
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);
    const fields = getDefaultFields(parsedSearch.resourceType);
    const sort = getDefaultSort(parsedSearch.resourceType);

    // Add the defaul fields to your parsed search definition
    const populatedSearch = {
      ...parsedSearch,
      fields,
    };

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      // If the url matches the parsed search and fields, execute the search
      setSearch(populatedSearch);
    } else {
      // If it doesn't, navigate to the correct URL
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        onNew={() => navigate(`/${search.resourceType}/new`)}
      ></SearchControl>
    </Paper>
  );
}

// Get the default fields for a given resource type
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

function getDefaultSort(resourceType: string): SortRule[] {
  const defaultSort = [{ code: '-_lastUpdated' }];

  switch (resourceType) {
    case 'Task':
      defaultSort[0] = { code: '-priority-order' };
  }

  return defaultSort;
}
