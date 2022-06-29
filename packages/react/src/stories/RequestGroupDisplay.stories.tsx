import { Meta } from '@storybook/react';
import { ExampleWorkflowRequestGroup } from '@medplum/mock';
import React from 'react';
import { RequestGroupDisplay } from '../RequestGroupDisplay';
import { Document } from '../Document';

export default {
  title: 'Medplum/RequestGroupDisplay',
  component: RequestGroupDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <RequestGroupDisplay value={ExampleWorkflowRequestGroup} />
  </Document>
);
