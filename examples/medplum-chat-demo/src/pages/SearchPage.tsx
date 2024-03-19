import {
  Filter,
  formatSearchQuery,
  getQuestionnaireAnswers,
  getReferenceString,
  Operator,
  parseSearchRequest,
  SearchRequest,
} from '@medplum/core';
import { QuestionnaireResponse, Resource } from '@medplum/fhirtypes';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    if (!parsedSearch.resourceType) {
      navigate('/Communication');
      return;
    }

    const populatedSearch = getPopulatedSearch(parsedSearch);
    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  const handleCreateThread = (formData: QuestionnaireResponse) => {
    const answers = getQuestionnaireAnswers(formData);
  };

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideFilters={true}
        hideToolbar={true}
      />
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
    case 'Communication':
      fields.push('sender', 'recipient', 'sent');
      break;
  }

  return fields;
}
