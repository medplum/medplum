import { formatDateTime } from '@medplum/core';
import { Reference, Specimen } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import React from 'react';
import { InfoBar } from './InfoBar';

export interface SpecimenHeaderProps {
  specimen: Specimen | Reference<Specimen>;
}

export function SpecimenHeader(props: SpecimenHeaderProps): JSX.Element | null {
  const specimen = useResource(props.specimen);
  if (!specimen) {
    return null;
  }
  return (
    <InfoBar>
      <InfoBar.Entry>
        <InfoBar.Key>Type</InfoBar.Key>
        <InfoBar.Value>Specimen</InfoBar.Value>
      </InfoBar.Entry>
      <InfoBar.Entry>
        <InfoBar.Key>Collected</InfoBar.Key>
        <InfoBar.Value>{formatDateTime(specimen.collection?.collectedDateTime)}</InfoBar.Value>
      </InfoBar.Entry>
      <InfoBar.Entry>
        <InfoBar.Key>Age</InfoBar.Key>
        <InfoBar.Value>{getAge(specimen)}</InfoBar.Value>
      </InfoBar.Entry>
    </InfoBar>
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
