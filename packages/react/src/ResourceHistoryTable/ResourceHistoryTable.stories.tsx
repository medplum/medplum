import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceHistoryTable } from './ResourceHistoryTable';

export default {
  title: 'Medplum/ResourceHistoryTable',
  component: ResourceHistoryTable,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceHistoryTable resourceType="Patient" id={HomerSimpson.id} />
  </Document>
);
