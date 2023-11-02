import { DiagnosticReport } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { DefaultResourceTimeline } from './DefaultResourceTimeline';

export default {
  title: 'Medplum/DefaultResourceTimeline',
  component: DefaultResourceTimeline,
} as Meta;

export const Basic = (): JSX.Element | null => {
  const medplum = useMedplum();
  const [resource, setResource] = useState<DiagnosticReport>();
  useEffect(() => {
    medplum
      .createResource<DiagnosticReport>({
        resourceType: 'DiagnosticReport',
        meta: {
          lastUpdated: '2021-01-01T00:00:00Z',
        },
        code: { text: 'test' },
        issued: '2021-01-01T00:00:00Z',
        status: 'preliminary',
      })
      .then((report) => {
        report.status = 'final';
        return medplum.updateResource(report);
      })
      .then(setResource)
      .catch(console.error);
  }, [medplum]);

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <DefaultResourceTimeline resource={resource} />
    </Document>
  );
};
