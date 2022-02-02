import { getDisplayString, getReferenceString } from '@medplum/core';
import { Identifier, Reference, Resource } from '@medplum/fhirtypes';
import { Scrollable, useResource } from '@medplum/ui';
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

  function addEntry(key: string | undefined, value: string | undefined): void {
    if (key && value) {
      entries.push({ key, value });
    }
  }

  function addIdentifier(identifier: Identifier | undefined): void {
    if (identifier) {
      addEntry(identifier.system, identifier.value);
    }
  }

  const name = getDisplayString(resource);
  if (name !== getReferenceString(resource)) {
    entries.push({ key: 'Name', value: name });
  }

  if ('identifier' in resource) {
    if (Array.isArray(resource.identifier)) {
      resource.identifier.forEach(addIdentifier);
    } else {
      addIdentifier(resource.identifier);
    }
  }

  if (entries.length === 1) {
    // If no other names or identifiers were found,
    // then at least show the resource ID
    entries.push({ key: 'ID', value: resource.id });
  }

  return (
    <Scrollable className="medplum-surface" height={50}>
      <div className="medplum-resource-header">
        {entries.map((entry) => (
          <dl key={entry.key}>
            <dt>{entry.key}</dt>
            <dd>{entry.value}</dd>
          </dl>
        ))}
      </div>
    </Scrollable>
  );
}
