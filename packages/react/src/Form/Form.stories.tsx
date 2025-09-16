// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NativeSelect, Stack } from '@mantine/core';
import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { HumanNameInput } from '../HumanNameInput/HumanNameInput';
import { Form } from './Form';
import { SubmitButton } from './SubmitButton';

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
        <SubmitButton mt="sm">Submit</SubmitButton>
      </Stack>
    </Form>
  </Document>
);
