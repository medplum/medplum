
export interface SearchFilterDefinition {
  key: string;
  op: string;
  value?: string;
}

export interface SearchDefinition {
  resourceType: string;
  id?: string;
  name?: string;
  fields?: string[];
  filters?: SearchFilterDefinition[];
  sort?: string;
  countField?: string;
  page?: number;
  pageSize?: number;
  folderType?: number;
  folderEntityId?: string;
  default?: boolean;
}

/**
 * Parses a URL into a SearchDefinition.
 * @param location The URL to parse.
 * @returns Parsed search definition.
 */
export function parseSearchDefinition(location: { pathname: string, search?: string }): SearchDefinition {
  const resourceType = location.pathname.split('/').pop() as string;
  const params = new URLSearchParams(location.search);
  const fields = params.get('_fields') || 'id,meta.versionId,meta.lastUpdated,name,identifier';
  const filters = [] as SearchFilterDefinition[];
  const result: SearchDefinition = {
    resourceType: resourceType,
    fields: fields.split(','),
    sort: '-meta.lastUpdated'
  }

  params.forEach((value, key) => {
    if (key === '_fields') {
      return;
    }
    if (key === '_sort') {
      result.sort = value;
    } else if (key === '_page') {
      result.page = parseInt(value);
    } else {
      filters.push({
        key: key,
        op: 'eq',
        value: value
      });
    }
  });

  result.filters = filters;
  return result;
}

/**
 * Formats a search definition object into a query string.
 * Note: The return value does not include the resource type.
 * @param {!SearchDefinition} definition The search definition.
 * @returns Formatted URL.
 */
export function formatSearchQuery(definition: SearchDefinition): string {
  const params: string[] = [];

  if (definition.fields) {
    params.push('_fields=' + definition.fields.join(','));
  }

  if (definition.filters) {
    definition.filters.forEach(filter => {
      params.push(filter.key + '=' + filter.value);
    });
  }

  if (definition.sort) {
    params.push('_sort=' + definition.sort);
  }

  if (definition.page && definition.page > 0) {
    params.push('_page=' + definition.page);
  }

  if (params.length === 0) {
    return '';
  }

  params.sort();
  return '?' + params.join('&');
}
