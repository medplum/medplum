import { Filter, formatDateTime } from '@medplum/core';
import React from 'react';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';

export interface SearchFilterValueDisplayProps {
  readonly resourceType: string;
  readonly filter: Filter;
}

export function SearchFilterValueDisplay(props: SearchFilterValueDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const schema = medplum.getSchema();
  const searchParam = schema.types[props.resourceType]?.searchParams?.[props.filter.code];

  const filter = props.filter;
  if (searchParam?.type === 'reference') {
    return <ResourceName value={{ reference: filter.value }} />;
  }

  if (props.filter.code === '_lastUpdated' || searchParam?.type === 'datetime') {
    return <>{formatDateTime(filter.value)}</>;
  }

  return <>{filter.value}</>;
}
