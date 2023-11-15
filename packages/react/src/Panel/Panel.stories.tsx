import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { Panel } from './Panel';

export default {
  title: 'Medplum/Panel',
  component: Panel,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Panel>Your content here</Panel>
  </Document>
);

export const ExtraShadow = (): JSX.Element => (
  // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  <Document>
    <Panel shadow="xl">Your content here</Panel>
  </Document>
);

export const NoBorder = (): JSX.Element => (
  <Document>
    <Panel withBorder={false}>Your content here</Panel>
  </Document>
);

export const Rounded = (): JSX.Element => (
  // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  <Document>
    <Panel radius="xl">Your content here</Panel>
  </Document>
);

export const Nested = (): JSX.Element => (
  <Document>
    <Panel>
      Outer Panel
      <Panel radius="xl">Inner Panel</Panel>
    </Panel>
  </Document>
);
