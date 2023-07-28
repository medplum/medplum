import { createStyles, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  convertToTransactionBundle,
  DEFAULT_SEARCH_COUNT,
  Filter,
  formatSearchQuery,
  MedplumClient,
  normalizeErrorString,
  parseSearchDefinition,
  SearchRequest,
  SortRule,
} from '@medplum/core';
import { Bundle, ResourceType, UserConfiguration } from '@medplum/fhirtypes';
import { Loading, MemoizedSearchControl, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { exportJsonFile } from './utils';

const useStyles = createStyles((theme) => {
  return {
    paper: {
      [`@media (max-width: ${theme.breakpoints.sm})`]: {
        margin: 2,
        padding: 4,
      },
    },
  };
});

export function HomePage(): JSX.Element {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    // Parse the search from the URL
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);

    // Fill in the search with default values
    const populatedSearch = addSearchValues(parsedSearch, medplum.getUserConfiguration());

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
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs" className={classes.paper}>
      <MemoizedSearchControl
        checkboxesEnabled={true}
        search={search}
        userConfig={medplum.getUserConfiguration()}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
        onNew={
          canCreate(search.resourceType)
            ? () => {
                navigate(`/${search.resourceType}/new`);
              }
            : undefined
        }
        onExportCsv={() => {
          const url = medplum.fhirUrl(search.resourceType, '$csv') + formatSearchQuery(search);
          medplum
            .download(url)
            .then((blob: Blob) => {
              window.open(window.URL.createObjectURL(blob), '_blank');
            })
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
        }}
        onExportTransactionBundle={async () => {
          getTransactionBundle(search, medplum)
            .then((bundle) => exportJsonFile(JSON.stringify(bundle, undefined, 2)))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
        }}
        onDelete={(ids: string[]) => {
          if (window.confirm('Are you sure you want to delete these resources?')) {
            medplum.invalidateSearches(search.resourceType as ResourceType);
            medplum
              .executeBatch({
                resourceType: 'Bundle',
                type: 'batch',
                entry: ids.map((id) => ({
                  request: {
                    method: 'DELETE',
                    url: `${search.resourceType}/${id}`,
                  },
                })),
              })
              .then(() => setSearch({ ...search }))
              .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
          }
        }}
        onBulk={(ids: string[]) => {
          navigate(`/bulk/${search.resourceType}?ids=${ids.join(',')}`);
        }}
      />
    </Paper>
  );
}

function addSearchValues(search: SearchRequest, config: UserConfiguration | undefined): SearchRequest {
  const resourceType = search.resourceType || getDefaultResourceType(config);
  const fields = search.fields ?? getDefaultFields(resourceType);
  const filters = search.filters ?? (!search.resourceType ? getDefaultFilters(resourceType) : undefined);
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);
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

function getDefaultResourceType(config: UserConfiguration | undefined): string {
  return (
    localStorage.getItem('defaultResourceType') ??
    config?.option?.find((o) => o.id === 'defaultResourceType')?.valueString ??
    'Patient'
  );
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
    case 'UserConfiguration':
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

function getDefaultFilters(resourceType: string): Filter[] | undefined {
  return getLastSearch(resourceType)?.filters;
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

function canCreate(resourceType: string): boolean {
  return resourceType !== 'Bot' && resourceType !== 'ClientApplication';
}

async function getTransactionBundle(search: SearchRequest, medplum: MedplumClient): Promise<Bundle> {
  const transactionBundleSearch: SearchRequest = {
    resourceType: search.resourceType,
    count: 1000,
    offset: 0,
    filters: search.filters,
  };
  const transactionBundleSearchValues = addSearchValues(transactionBundleSearch, medplum.getUserConfiguration());
  const bundle = await medplum.search(
    transactionBundleSearchValues.resourceType as ResourceType,
    formatSearchQuery({ ...transactionBundleSearchValues, total: 'accurate', fields: undefined })
  );
  return convertToTransactionBundle(bundle);
}
