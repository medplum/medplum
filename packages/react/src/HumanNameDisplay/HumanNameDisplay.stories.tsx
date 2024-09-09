import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { HumanNameDisplay } from './HumanNameDisplay';

export default {
  title: 'Medplum/HumanNameDisplay',
  component: HumanNameDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <HumanNameDisplay value={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName} />
  </Document>
);
