import { formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Loading, SearchControl, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function HomePage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));

  useEffect(() => {
    const parsedSearch = parseSearchDefinition(location);

    if (parsedSearch.resourceType && parsedSearch.fields && parsedSearch.fields.length > 0) {
      // If the URL has a resourceType and fields,
      // use that
      setDefaultResourceType(parsedSearch.resourceType);
      setDefaultSearchForResourceType(parsedSearch);
      setSearch(parsedSearch);
    } else if (parsedSearch.resourceType) {
      // If the URL has a resourceType but no fields,
      // use the default search for that resourceType
      setDefaultResourceType(parsedSearch.resourceType);
      setSearch(getDefaultSearchForResourceType(parsedSearch.resourceType));
    } else {
      // Otherwise, use the default search
      setSearch(getDefaultSearch());
    }
  }, [location]);

  if (!search.resourceType) {
    return <Loading />;
  }

  return (
    <SearchControl
      checkboxesEnabled={true}
      search={search}
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
      onChange={(e) => {
        if (e.definition.resourceType && e.definition.fields && e.definition.fields.length > 0) {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }
      }}
      onNew={() => {
        navigate(`/${search.resourceType}/new`);
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

function getDefaultSearch(): SearchRequest {
  return getDefaultSearchForResourceType(getDefaultResourceType());
}

function getDefaultResourceType(): string {
  return localStorage.getItem('defaultResourceType') || 'Patient';
}

function setDefaultResourceType(resourceType: string): void {
  if (resourceType) {
    localStorage.setItem('defaultResourceType', resourceType);
  }
}

export function getDefaultSearchForResourceType(resourceType: string): SearchRequest {
  const value = localStorage.getItem(resourceType + '-defaultSearch');
  if (value) {
    return JSON.parse(value) as SearchRequest;
  }
  const fields = ['id', '_lastUpdated'];
  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthDate', 'gender');
      break;
    case 'AccessPolicy':
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
  return {
    resourceType,
    fields,
    sortRules: [
      {
        code: '_lastUpdated',
        descending: true,
      },
    ],
    page: 0,
    count: 20,
  };
}

function setDefaultSearchForResourceType(search: SearchRequest): void {
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}
