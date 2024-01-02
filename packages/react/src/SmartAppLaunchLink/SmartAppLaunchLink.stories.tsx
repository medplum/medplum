import { createReference } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { SmartAppLaunchLink } from './SmartAppLaunchLink';

export default {
  title: 'Medplum/SmartAppLaunchLink',
  component: SmartAppLaunchLink,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <SmartAppLaunchLink
      client={{ resourceType: 'ClientApplication', launchUri: 'https://example.com' }}
      patient={createReference(HomerSimpson)}
    >
      Example SMART Launch
    </SmartAppLaunchLink>
  </Document>
);
