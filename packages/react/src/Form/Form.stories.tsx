import { Button, NativeSelect, Stack } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { HumanNameInput } from '../HumanNameInput/HumanNameInput';
import { Form } from './Form';

export default {
  title: 'Medplum/Form',
  component: Form,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Form onSubmit={console.log}>
      <Stack>
        <HumanNameInput
          name="patient-name"
          path="name"
          onChange={undefined}
          outcome={undefined}
          defaultValue={{ given: ['Homer'], family: 'Simpson' } as HumanName}
        />
        <NativeSelect name="appointment-type" data={['Sick', 'Well']} />
        <Button type="submit" mt="sm">
          Submit
        </Button>
      </Stack>
    </Form>
  </Document>
);
