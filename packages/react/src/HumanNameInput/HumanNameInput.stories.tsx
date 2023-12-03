import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { HumanNameInput } from './HumanNameInput';

export default {
  title: 'Medplum/HumanNameInput',
  component: HumanNameInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <HumanNameInput
      name="patient-name"
      defaultValue={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName}
      onChange={console.log}
    />
  </Document>
);
