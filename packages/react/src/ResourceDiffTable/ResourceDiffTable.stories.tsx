import { Patient } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceDiffTable } from './ResourceDiffTable';

export default {
  title: 'Medplum/ResourceDiffTable',
  component: ResourceDiffTable,
} as Meta;

export const Basic = (): JSX.Element => {
  const original = HomerSimpson;
  const revised = {
    ...HomerSimpson,
    gender: 'unknown',
    name: [{ given: ['Homer', 'J.'], family: 'Sampson' }],
  } as Patient;
  return (
    <Document>
      <ResourceDiffTable original={original} revised={revised} />
    </Document>
  );
};
