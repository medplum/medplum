import { Filter, Operator, parseSearchRequest, SearchRequest } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState<SearchRequest>();

  const searchQuery = location.search;
  const currentSearch = parseSearchRequest(searchQuery);

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    if (!parsedSearch.resourceType) {
      navigate('/Communication');
      return;
    }

    const populatedSearch = getPopulatedSearch(parsedSearch);
    console.log(populatedSearch);
    setSearch(populatedSearch);
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      <SearchControl search={search} />
    </Document>
  );
}

function getPopulatedSearch(search: SearchRequest): SearchRequest<Resource> {
  const filters = search.filters ?? getDefaultFilters(search.resourceType);
  const fields = search.fields ?? getDefaultFields(search.resourceType);
  const sortRules = search.sortRules ?? [{ code: '-_lastUpdated' }];

  return {
    resourceType: search.resourceType,
    filters,
    fields,
    sortRules,
  };
}

function getDefaultFilters(resourceType: string): Filter[] {
  const filters = [];

  switch (resourceType) {
    case 'Communication':
      filters.push({ code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' });
      break;
  }

  return filters;
}

function getDefaultFields(resourceType: string) {
  const fields = ['id'];

  switch (resourceType) {
    case 'Communicatoin':
      fields.push('sender', 'recipient', 'sent');
  }

  return fields;
}
