import { Filter } from '@medplum/core';
import React from 'react';
import { useMedplum } from './MedplumProvider';
import { ResourceBadge } from './ResourceBadge';

export interface SearchFilterValueDisplayProps {
  readonly resourceType: string;
  readonly filter: Filter;
}

export function SearchFilterValueDisplay(props: SearchFilterValueDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const schema = medplum.getSchema(props.resourceType);
  if (!schema) {
    return null;
  }

  const searchParam = schema.types[props.resourceType].searchParams?.[props.filter.code];

  const filter = props.filter;
  if (searchParam?.type === 'reference') {
    return <ResourceBadge value={{ reference: filter.value }} />;
  }

  if (props.filter.code === '_lastUpdated' || searchParam?.type === 'datetime') {
    return <>{new Date(filter.value).toLocaleString()}</>;
  }

  return <>{filter.value}</>;
}
