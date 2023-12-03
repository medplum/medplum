import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceBadge } from './ResourceBadge';

export default {
  title: 'Medplum/ResourceBadge',
  component: ResourceBadge,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceBadge value={HomerSimpson} />
  </Document>
);
