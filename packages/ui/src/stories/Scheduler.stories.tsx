import { createReference } from '@medplum/core';
import { DrAliceSmith } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { Scheduler } from '../Scheduler';

export default {
  title: 'Medplum/Scheduler',
  component: Scheduler,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Scheduler schedule={{ resourceType: 'Schedule', actor: [createReference(DrAliceSmith)] }} />
  </Document>
);
