import { ExampleWorkflowRequestGroup } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { RequestGroupDisplay } from '../RequestGroupDisplay';
import { Covid19RequestGroup } from '@medplum/mock';

export default {
  title: 'Medplum/RequestGroupDisplay',
  component: RequestGroupDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <RequestGroupDisplay onStart={console.log} onEdit={console.log} value={ExampleWorkflowRequestGroup} />
  </Document>
);

export const Covid19 = (): JSX.Element => (
  <Document>
    <RequestGroupDisplay onStart={console.log} onEdit={console.log} value={Covid19RequestGroup} />
  </Document>
);
