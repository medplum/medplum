import { ScrollArea } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import { Reference, Specimen } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import React from 'react';

export interface SpecimenHeaderProps {
  specimen: Specimen | Reference<Specimen>;
}

export function SpecimenHeader(props: SpecimenHeaderProps): JSX.Element | null {
  const specimen = useResource(props.specimen);
  if (!specimen) {
    return null;
  }
  return (
    <ScrollArea>
      <div className="medplum-resource-header">
        <dl>
          <dt>Type</dt>
          <dd>Specimen</dd>
        </dl>
        <dl>
          <dt>Collected</dt>
          <dd>{formatDateTime(specimen?.collection?.collectedDateTime)}</dd>
        </dl>
        <dl>
          <dt>Age</dt>
          <dd>{getAge(specimen)}</dd>
        </dl>
      </div>
    </ScrollArea>
  );
}

function getAge(specimen: Specimen): string | undefined {
  const collectedDateStr = specimen.collection?.collectedDateTime;
  if (!collectedDateStr) {
    return undefined;
  }

  const collectedDate = new Date(collectedDateStr);
  const now = new Date();
  const diffInTime = now.getTime() - collectedDate.getTime();
  const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));
  return diffInDays.toString().padStart(3, '0') + 'D';
}
