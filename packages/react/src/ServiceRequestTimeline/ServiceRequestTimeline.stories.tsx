import { HomerServiceRequest } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ServiceRequestTimeline } from './ServiceRequestTimeline';

export default {
  title: 'Medplum/ServiceRequestTimeline',
  component: ServiceRequestTimeline,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ServiceRequestTimeline serviceRequest={HomerServiceRequest} />
  </Document>
);
