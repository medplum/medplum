import { Reference, Resource } from '@medplum/fhirtypes';
import { useResource } from '@medplum/ui';
import React from 'react';
import './ResourceHeader.css';

export interface ResourceHeaderProps {
  resource: Resource | Reference<Resource>;
}

export function ResourceHeader(props: ResourceHeaderProps): JSX.Element | null {
  const resource = useResource(props.resource);
  if (!resource) {
    return null;
  }

  const entries: { key: string; value: string | undefined }[] = [{ key: 'Type', value: resource.resourceType }];

  // let identifierArray: Identifier[] | undefined = undefined;
  // let identifier: Identifier | undefined = undefined;
  if ('identifier' in resource) {
    if (Array.isArray(resource.identifier)) {
      // identifierArray = resource.identifier;
      resource.identifier.forEach((id) => entries.push({ key: id.system as string, value: id.value }));
    } else {
      // identifier = resource.identifier;
      entries.push({ key: resource.identifier?.system as string, value: resource.identifier?.value });
    }
  }

  if (entries.length === 1) {
    entries.push({ key: 'ID', value: resource.id });
  }

  return (
    <div className="medplum-resource-header">
      {entries.map((entry) => (
        <dl key={entry.key}>
          <dt>{entry.key}</dt>
          <dd>{entry.value}</dd>
        </dl>
      ))}
    </div>
  );
}
