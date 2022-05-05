import { getReferenceString, Operator } from '@medplum/core';
import { BundleEntry, Patient, Reference, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { MedplumLink, sortByDate, useMedplum, useResource } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { getPatient } from './utils';
import './QuickServiceRequests.css';

export interface QuickServiceRequestsProps {
  value: Resource | Reference;
}

export function QuickServiceRequests(props: QuickServiceRequestsProps): JSX.Element | null {
  const medplum = useMedplum();
  const resource = useResource(props.value);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>();

  useEffect(() => {
    if (!resource) {
      return;
    }
    const patient = getPatient(resource);
    if (!patient) {
      return;
    }
    const patientRefStr = 'reference' in patient ? patient.reference : getReferenceString(patient as Patient);
    medplum
      .search<ServiceRequest>({
        resourceType: 'ServiceRequest',
        filters: [{ code: 'subject', operator: Operator.EQUALS, value: patientRefStr as string }],
      })
      .then((bundle) => {
        const entries = bundle.entry as BundleEntry<ServiceRequest>[];
        const resources = entries.map((e) => e.resource as ServiceRequest);
        sortByDate(resources);
        resources.reverse();
        setServiceRequests(resources);
      });
  }, [medplum, resource]);

  if (!serviceRequests) {
    return null;
  }

  return (
    <div className="medplum-quick-service-request-container">
      {serviceRequests.map((r) => (
        <div key={r.id} className={'medplum-quick-service-request' + (r.id === resource?.id ? ' active' : '')}>
          <p>
            <MedplumLink to={r}>{getServiceRequestIdentifier(r)}</MedplumLink>
          </p>
          {r.category?.[0]?.text && <p>{r.category?.[0]?.text}</p>}
          {r.code?.coding?.[0]?.code && <p>{r.code?.coding?.[0]?.code}</p>}
          <p>{getServiceRequestDate(r)}</p>
        </div>
      ))}
    </div>
  );
}

function getServiceRequestIdentifier(serviceRequest: ServiceRequest): string {
  if (serviceRequest.identifier) {
    for (const identifier of serviceRequest.identifier) {
      if (identifier.value) {
        return identifier.value;
      }
    }
  }

  return serviceRequest.id || '';
}

function getServiceRequestDate(serviceRequest: ServiceRequest): string {
  if (serviceRequest.authoredOn) {
    return serviceRequest.authoredOn.substring(0, 10);
  }
  if (serviceRequest.meta?.lastUpdated) {
    return serviceRequest.meta.lastUpdated.substring(0, 10);
  }
  return '';
}
