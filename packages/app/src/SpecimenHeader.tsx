import { Reference, Specimen } from '@medplum/fhirtypes';
import { DateTimeDisplay, Scrollable, useResource } from '@medplum/ui';
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
    <Scrollable className="medplum-surface" height={50}>
      <div className="medplum-resource-header">
        <dl>
          <dt>Type</dt>
          <dd>Specimen</dd>
        </dl>
        <dl>
          <dt>Collected</dt>
          <dd>
            <DateTimeDisplay value={specimen?.collection?.collectedDateTime} />
          </dd>
        </dl>
        <dl>
          <dt>Age</dt>
          <dd>{getAge(specimen)}</dd>
        </dl>
      </div>
    </Scrollable>
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
