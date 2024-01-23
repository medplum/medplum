import { Filter, Operator, SearchRequest, SortRule } from '@medplum/core';

// Get the default fields for a given resource type
function getDefaultFields(resourceType: string): string[] {
  const fields = [];

  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthdate', 'gender');
      break;
    case 'Practitioner':
      fields.push('name', 'birthdate', 'gender');
      break;
    case 'DiagnosticReport':
      fields.push('subject', 'code', 'status');
      break;
    case 'Communication':
      fields.push('sender', 'recipient', 'payload');
      break;
    case 'Task':
      fields.push('code', '_lastUpdated', 'owner', 'for', 'priority');
  }

  return fields;
}

// Get the default sort rules for a given resource type
function getSortRules(resourceType: string): SortRule[] {
  const sortRules = [];

  if (resourceType === 'Task') {
    sortRules.push({ code: '-priority-order,due-date' });
  } else {
    sortRules.push({ code: '-_lastUpdated' });
  }

  return sortRules;
}

// Get the default filters for a given resource type
function getFilters(resourceType: string): Filter[] {
  if (resourceType === 'Task') {
    return [{ code: 'status:not', operator: Operator.EQUALS, value: 'completed' }];
  } else {
    return [];
  }
}

export function getPopulatedSearch(parsedSearch: SearchRequest): SearchRequest {
  const fields = parsedSearch.fields ?? getDefaultFields(parsedSearch.resourceType);
  const sortRules = parsedSearch.sortRules ?? getSortRules(parsedSearch.resourceType);
  const filters = parsedSearch.filters ?? getFilters(parsedSearch.resourceType);

  const populatedSearch: SearchRequest = {
    ...parsedSearch,
    fields,
    sortRules,
    filters,
  };

  return populatedSearch;
}
