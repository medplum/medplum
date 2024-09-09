import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { StatusBadge } from './StatusBadge';

export default {
  title: 'Medplum/StatusBadge',
  component: StatusBadge,
} as Meta;

export const ExampleStatuses = (): JSX.Element => (
  <Document>
    <div style={{ lineHeight: '200%' }}>
      <div>
        Status: <StatusBadge status="active" />
      </div>
      <div>
        Status: <StatusBadge status="on-hold" />
      </div>
      <div>
        Status: <StatusBadge status="completed" />
      </div>
      <div>
        Status: <StatusBadge status="cancelled" />
      </div>
      <div>
        Status: <StatusBadge status="unknown" />
      </div>
    </div>
  </Document>
);
