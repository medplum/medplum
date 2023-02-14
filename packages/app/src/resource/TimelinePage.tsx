import { ResourceType } from '@medplum/fhirtypes';
import { DefaultResourceTimeline, EncounterTimeline, PatientTimeline, ServiceRequestTimeline } from '@medplum/react';
import React from 'react';
import { useParams } from 'react-router-dom';

export function TimelinePage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };
  switch (resourceType) {
    case 'Encounter':
      return <EncounterTimeline encounter={reference} />;
    case 'Patient':
      return <PatientTimeline patient={reference} />;
    case 'ServiceRequest':
      return <ServiceRequestTimeline serviceRequest={reference} />;
    default:
      return <DefaultResourceTimeline resource={reference} />;
  }
}
