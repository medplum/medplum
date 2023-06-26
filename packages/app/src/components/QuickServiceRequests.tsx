import { createStyles } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { BundleEntry, Patient, Reference, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { MedplumLink, sortByDateAndPriority, useMedplum, useResource } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { getPatient } from '../utils';

const useStyles = createStyles((theme) => ({
  container: {
    position: 'fixed',
    top: 300,
    left: 0,
    width: 160,
    zIndex: 5,
    fontSize: theme.fontSizes.xs,
    '@media (max-width: 700px)': {
      display: 'none',
    },
  },
  entry: {
    textAlign: 'center',
    width: 150,
    backgroundColor: theme.colors.gray[0],
    border: `1px solid ${theme.colors.gray[3]}`,
  },
  active: {
    width: 160,
    backgroundColor: theme.colors.yellow[0],
    border: `1px solid ${theme.colors.yellow[5]}`,
  },
}));

export interface QuickServiceRequestsProps {
  value: Resource | Reference;
}

export function QuickServiceRequests(props: QuickServiceRequestsProps): JSX.Element | null {
  const { classes, cx } = useStyles();
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
      .search('ServiceRequest', 'subject=' + patientRefStr)
      .then((bundle) => {
        const entries = bundle.entry as BundleEntry<ServiceRequest>[];
        const resources = entries.map((e) => e.resource as ServiceRequest);
        sortByDateAndPriority(resources);
        resources.reverse();
        setServiceRequests(resources);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, resource]);

  if (!serviceRequests) {
    return null;
  }

  return (
    <div data-testid="quick-service-requests" className={classes.container}>
      {serviceRequests.map((r) => (
        <div key={r.id} className={cx(classes.entry, { [classes.active]: r.id === resource?.id })}>
          <p>
            <MedplumLink to={r}>{getServiceRequestIdentifier(r)}</MedplumLink>
          </p>
          {r.category?.[0]?.text && <p>{r.category[0]?.text}</p>}
          {r.code?.coding?.[0]?.code && <p>{r.code.coding[0]?.code}</p>}
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
