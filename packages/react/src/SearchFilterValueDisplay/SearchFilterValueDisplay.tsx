import { Filter, formatDateTime, getSearchParameterDetails, globalSchema, SearchParameterType } from '@medplum/core';
import React from 'react';
import { ResourceName } from '../ResourceName/ResourceName';

export interface SearchFilterValueDisplayProps {
  readonly resourceType: string;
  readonly filter: Filter;
}

export function SearchFilterValueDisplay(props: SearchFilterValueDisplayProps): JSX.Element {
  const { resourceType, filter } = props;

  const searchParam = globalSchema.types[resourceType]?.searchParams?.[filter.code];
  if (searchParam) {
    if (searchParam.type === 'reference') {
      return <ResourceName value={{ reference: filter.value }} />;
    }

    const searchParamDetails = getSearchParameterDetails(resourceType, searchParam);
    if (filter.code === '_lastUpdated' || searchParamDetails.type === SearchParameterType.DATETIME) {
      return <>{formatDateTime(filter.value)}</>;
    }
  }

  return <>{filter.value}</>;
}
