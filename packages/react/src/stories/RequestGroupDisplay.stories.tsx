import { ExampleWorkflowRequestGroup } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { RequestGroupDisplay } from '../RequestGroupDisplay';

export default {
  title: 'Medplum/RequestGroupDisplay',
  component: RequestGroupDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <RequestGroupDisplay onStart={console.log} onEdit={console.log} value={ExampleWorkflowRequestGroup} />
  </Document>
);
