import { formatSearchQuery, parseSearchDefinition, SearchRequest, SortRule } from '@medplum/core';
import { Loading, MemoizedSearchControl, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));

  useEffect(() => {
    // Parse the search from the URL
    const parsedSearch = parseSearchDefinition(location);

    // Fill in the search with default values
    const populatedSearch = addDefaultSearchValues(parsedSearch);

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      // If the URL matches the parsed search, then save it and execute it
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      // Otherwise, navigate to the desired URL
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [location]);

  if (!search.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <MemoizedSearchControl
      checkboxesEnabled={true}
      search={search}
      userConfig={medplum.getUserConfiguration()}
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
      onChange={(e) => {
        navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
      }}
      onNew={() => {
        navigate(`/${search.resourceType}/new`);
      }}
      onExport={() => {
        const url = medplum.fhirUrl(search.resourceType) + '/$csv' + formatSearchQuery(search);
        medplum.download(url).then((blob) => {
          window.open(window.URL.createObjectURL(blob), '_blank');
        });
      }}
      onDelete={(ids: string[]) => {
        if (window.confirm('Are you sure you want to delete these resources?')) {
          medplum
            .post('fhir/R4', {
              resourceType: 'Bundle',
              type: 'batch',
              entry: ids.map((id) => ({
                request: {
                  method: 'DELETE',
                  url: `${search.resourceType}/${id}`,
                },
              })),
            })
            .then(() => setSearch({ ...search }));
        }
      }}
    />
  );
}

function addDefaultSearchValues(search: SearchRequest): SearchRequest {
  const resourceType = search.resourceType || getDefaultResourceType();
  const fields = search.fields ?? getDefaultFields(resourceType);
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);
  const page = search.page ?? 0;
  const count = search.count ?? 20;

  return {
    ...search,
    resourceType,
    fields,
    sortRules,
    page,
    count,
  };
}

function getDefaultResourceType(): string {
  return localStorage.getItem('defaultResourceType') || 'Patient';
}

export function getDefaultFields(resourceType: string): string[] {
  const lastSearch = getLastSearch(resourceType);
  if (lastSearch?.fields) {
    return lastSearch.fields;
  }
  const fields = ['id', '_lastUpdated'];
  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthDate', 'gender');
      break;
    case 'AccessPolicy':
    case 'Bot':
    case 'ClientApplication':
    case 'Practitioner':
    case 'Project':
    case 'Organization':
    case 'Questionnaire':
      fields.push('name');
      break;
    case 'CodeSystem':
    case 'ValueSet':
      fields.push('name', 'title', 'status');
      break;
    case 'Condition':
      fields.push('subject', 'code', 'clinicalStatus');
      break;
    case 'Device':
      fields.push('manufacturer', 'deviceName', 'patient');
      break;
    case 'DeviceDefinition':
      fields.push('manufacturer[x]', 'deviceName');
      break;
    case 'DeviceRequest':
      fields.push('code[x]', 'subject');
      break;
    case 'DiagnosticReport':
    case 'Observation':
      fields.push('subject', 'code', 'status');
      break;
    case 'Encounter':
      fields.push('subject');
      break;
    case 'ServiceRequest':
      fields.push('subject', 'code', 'status', 'orderDetail');
      break;
    case 'Subscription':
      fields.push('criteria');
      break;
    case 'User':
      fields.push('email');
      break;
  }
  return fields;
}

function getDefaultSortRules(resourceType: string): SortRule[] {
  const lastSearch = getLastSearch(resourceType);
  if (lastSearch?.sortRules) {
    return lastSearch.sortRules;
  }
  return [{ code: '_lastUpdated', descending: true }];
}

function getLastSearch(resourceType: string): SearchRequest | undefined {
  const value = localStorage.getItem(resourceType + '-defaultSearch');
  return value ? (JSON.parse(value) as SearchRequest) : undefined;
}

function saveLastSearch(search: SearchRequest): void {
  localStorage.setItem('defaultResourceType', search.resourceType);
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}
