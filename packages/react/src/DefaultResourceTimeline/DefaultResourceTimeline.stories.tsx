import { DiagnosticReport } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState, useContext } from 'react';
import { Document } from '../Document/Document';
import { DefaultResourceTimeline } from './DefaultResourceTimeline';
import { Meta } from '@storybook/react';
import { createIdGenerator } from '@medplum/core';
import { withMockedDate, MockDateContext } from '../utils/MockDateWrapper';

export default {
  title: 'Medplum/DefaultResourceTimeline',
  component: DefaultResourceTimeline,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element | null => {
  const medplum = useMedplum();
  const [resource, setResource] = useState<DiagnosticReport>();
  const { advanceSystemTime } = useContext(MockDateContext);

  useEffect(() => {
    const uuid = createIdGenerator();
    medplum
      .createResource<DiagnosticReport>({
        id: uuid(),
        resourceType: 'DiagnosticReport',
        code: { text: 'test' },
        issued: '2021-01-01T00:00:00Z',
        status: 'preliminary',
      })
      .then((report) => {
        report.status = 'final';
        advanceSystemTime();
        return medplum.updateResource(report);
      })
      .then(setResource)
      .catch(console.error);
  }, [medplum, advanceSystemTime]);

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <DefaultResourceTimeline resource={resource} />
    </Document>
  );
};
