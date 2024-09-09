import { useDisclosure } from '@mantine/hooks';
import {
  Filter,
  formatSearchQuery,
  getReferenceString,
  Operator,
  parseSearchDefinition,
  SearchRequest,
} from '@medplum/core';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateCoverageModal } from '../components/CreateCoverageModal';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const location = useLocation();
  const navigate = useNavigate();
  const [opened, handlers] = useDisclosure();

  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);
    // Default to the Coverage search page
    if (!parsedSearch.resourceType) {
      navigate('/Coverage');
      return;
    }

    const populatedSearch = getPopulatedSearch(parsedSearch);

    // Set the search if we are on the correct page, otherwise navigate to the correct page
    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideFilters={true}
        onNew={() => handlers.open()}
        hideToolbar={search.resourceType === 'Coverage'}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
      />
      <CreateCoverageModal opened={opened} onClose={handlers.close} />
    </Document>
  );
}

function getPopulatedSearch(search: SearchRequest): SearchRequest {
  const fields = search.fields ?? getDefaultFields(search.resourceType);
  const sortRules = search.sortRules ?? [{ code: '-_lastUpdated' }];
  const filters = search.filters ?? getDefaultFilters(search.resourceType);

  const populatedSearch: SearchRequest = {
    ...search,
    fields,
    sortRules,
    filters,
  };
  return populatedSearch;
}

function getDefaultFilters(resourceType: string): Filter[] {
  if (resourceType === 'Coverage') {
    return [{ code: 'status', operator: Operator.EQUALS, value: 'active' }];
  } else {
    return [];
  }
}

function getDefaultFields(resourceType: string): string[] {
  const fields = [];

  switch (resourceType) {
    case 'Coverage':
      fields.push('beneficiary', 'relationship', 'payor', 'type');
      break;
    case 'Patient':
      fields.push('name', 'birthdate', 'gender');
      break;
    case 'CoverageEligibilityRequest':
      fields.push('patient', 'purpose', 'item', 'insurance');
      break;
    case 'CoverageEligibilityResponse':
      fields.push('patient', 'outcome', 'disposition', 'insurance');
      break;
    default:
      fields.push('id', '_lastUpdated');
  }

  return fields;
}
