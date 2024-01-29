import { formatDateTime } from '@medplum/core';
import { Reference, Specimen } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { InfoBar } from './InfoBar';

export interface SpecimenHeaderProps {
  readonly specimen: Specimen | Reference<Specimen>;
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
        <InfoBar.Key>Specimen Age</InfoBar.Key>
        <InfoBar.Value>{getAge(specimen)}</InfoBar.Value>
      </InfoBar.Entry>
      {specimen.collection?.collectedDateTime && specimen.receivedTime ? (
        <InfoBar.Entry>
          <InfoBar.Key>Specimen Stability</InfoBar.Key>
          <InfoBar.Value>{getStability(specimen)}</InfoBar.Value>
        </InfoBar.Entry>
      ) : (
        <></>
      )}
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
  return formatDaysBetween(daysBetween(collectedDate, now));
}

function getStability(specimen: Specimen): string | undefined {
  if (!specimen.collection?.collectedDateTime || !specimen.receivedTime) {
    return undefined;
  }
  const collectedDate = new Date(specimen.collection.collectedDateTime);
  const receivedDate = new Date(specimen.receivedTime);
  return formatDaysBetween(daysBetween(collectedDate, receivedDate));
}

function formatDaysBetween(diffInDays: number): string {
  return diffInDays.toString().padStart(3, '0') + 'D';
}

function daysBetween(start: Date, end: Date): number {
  const diffInTime = end.getTime() - start.getTime();
  const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));
  return diffInDays;
}
