import { ResourceType } from '@medplum/fhirtypes';
import { DefaultResourceTimeline, EncounterTimeline, PatientTimeline, ServiceRequestTimeline } from '@medplum/react';
import React from 'react';
import { useParams } from 'react-router-dom';

export function TimelinePage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };
  const reloadCache = { cache: 'reload' } as RequestInit;
  
  switch (resourceType) {
    case 'Encounter':
      return <EncounterTimeline encounter={reference} options={reloadCache} />;
    case 'Patient':
      return <PatientTimeline patient={reference} options={reloadCache} />;
    case 'ServiceRequest':
      return <ServiceRequestTimeline serviceRequest={reference} options={reloadCache} />;
    default:
      return <DefaultResourceTimeline resource={reference} options={reloadCache} />;
  }
}
