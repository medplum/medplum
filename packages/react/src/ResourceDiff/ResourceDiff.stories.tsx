import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceDiff } from './ResourceDiff';

export default {
  title: 'Medplum/ResourceDiff',
  component: ResourceDiff,
} as Meta;

export const Basic = (): JSX.Element => {
  const original = HomerSimpson;
  const revised = { ...HomerSimpson, name: [{ given: ['Homer', 'J.'], family: 'Sampson' }] };
  return (
    <Document>
      <ResourceDiff original={original} revised={revised} />
    </Document>
  );
};
