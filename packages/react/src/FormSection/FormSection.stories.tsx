import { Button, MultiSelect, NativeSelect, Stack } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { Form } from '../Form/Form';
import { HumanNameInput } from '../HumanNameInput/HumanNameInput';
import { FormSection } from './FormSection';

export default {
  title: 'Medplum/FormSection',
  component: FormSection,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Form onSubmit={console.log}>
      <Stack>
        <FormSection
          title="Demographics"
          description="Basic Patient Information
      "
        >
          <HumanNameInput name="patient-name" defaultValue={{ given: ['Homer'], family: 'Simpson' } as HumanName} />
          <NativeSelect name="gender" data={['Male', 'Female', 'Other']} />
        </FormSection>

        <FormSection title="Symptoms" description="Description of patient symptoms">
          <MultiSelect name="symptoms" data={['Sore Throat', 'Coughing', 'Fever', 'Rash']} />
        </FormSection>
      </Stack>
      <Button type="submit" mt="sm">
        Submit
      </Button>
    </Form>
  </Document>
);
