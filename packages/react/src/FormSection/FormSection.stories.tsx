import { Button, MultiSelect, NativeSelect, Stack } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
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
          <HumanNameInput
            name="patient-name"
            path="Patient.name"
            defaultValue={{ given: ['Homer'], family: 'Simpson' } as HumanName}
            onChange={undefined}
            outcome={undefined}
          />
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

export const Readonly = (): JSX.Element => (
  <Document>
    <FormSection
      readonly
      title="Demographics"
      description="Basic Patient Information
      "
    >
      <HumanNameInput
        disabled
        name="patient-name"
        path="Patient.name"
        defaultValue={{ given: ['Homer'], family: 'Simpson' } as HumanName}
        onChange={undefined}
        outcome={undefined}
      />
    </FormSection>
  </Document>
);
