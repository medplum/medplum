import { getDisplayString, getReferenceString } from '@medplum/core';
import { CodeableConcept, Identifier, Reference, Resource } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import React from 'react';
import { InfoBar } from './InfoBar';

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

  function addConcept(key: string, concept: CodeableConcept[] | CodeableConcept | string[] | string | undefined): void {
    if (Array.isArray(concept)) {
      concept.forEach((c) => addConcept(key, c));
    } else if (typeof concept === 'string') {
      addEntry(key, concept);
    } else if (concept) {
      if (Array.isArray(concept.coding)) {
        addEntry(key, concept.coding.map((c) => c.display || c.code).join(', '));
      } else {
        addEntry(key, concept?.text);
      }
    }
  }

  const name = getDisplayString(resource);
  if (name !== getReferenceString(resource)) {
    addEntry('Name', name);
  }

  if ('category' in resource) {
    addConcept('Category', resource.category);
  }

  if (resource.resourceType !== 'Bot' && 'code' in resource) {
    addConcept('Code', resource.code);
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
    <InfoBar>
      {entries.map((entry) => (
        <InfoBar.Entry key={entry.key}>
          <InfoBar.Key>{entry.key}</InfoBar.Key>
          <InfoBar.Value>{entry.value}</InfoBar.Value>
        </InfoBar.Entry>
      ))}
    </InfoBar>
  );
}
