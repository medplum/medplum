import {
  convertToTransactionBundle,
  DEFAULT_SEARCH_COUNT,
  Filter,
  formatSearchQuery,
  MedplumClient,
  SearchRequest,
  SortRule,
} from '@medplum/core';
import { Bundle, ResourceType, UserConfiguration } from '@medplum/fhirtypes';

/** Custom navigation paths when the user clicks New... */
export const RESOURCE_TYPE_CREATION_PATHS: Partial<Record<ResourceType, string>> = {
  Bot: '/admin/bots/new',
  ClientApplication: '/admin/clients/new',
};
export function addSearchValues(search: SearchRequest, config: UserConfiguration | undefined): SearchRequest {
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

export function saveLastSearch(search: SearchRequest): void {
  localStorage.setItem('defaultResourceType', search.resourceType);
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}

export async function getTransactionBundle(search: SearchRequest, medplum: MedplumClient): Promise<Bundle> {
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
