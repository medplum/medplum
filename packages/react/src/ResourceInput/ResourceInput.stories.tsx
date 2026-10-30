// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Code, Group } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { BartSimpson, HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import { ResourceInput } from './ResourceInput';

export default {
  title: 'Medplum/ResourceInput',
  component: ResourceInput,
} as Meta;

export const Practitioners = (): JSX.Element => (
  <Document>
    <ResourceInput name="foo" resourceType="Practitioner" />
  </Document>
);

export const Patients = (): JSX.Element => (
  <Document>
    <ResourceInput name="foo" resourceType="Patient" defaultValue={createReference(HomerSimpson)} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <ResourceInput disabled name="foo" resourceType="Patient" defaultValue={createReference(HomerSimpson)} />
  </Document>
);

export const Error = (): JSX.Element => (
  <Document>
    <ResourceInput
      name="foo"
      resourceType="Patient"
      defaultValue={createReference(HomerSimpson)}
      error="Something went wrong"
    />
  </Document>
);

export const Label = (): JSX.Element => (
  <Document>
    <ResourceInput name="foo" resourceType="Patient" defaultValue={createReference(HomerSimpson)} label="Patient" />
  </Document>
);

export function Controlled(): JSX.Element {
  const [value, setValue] = useState<Reference<Patient> | null>(createReference(HomerSimpson));
  return (
    <Document>
      <ResourceInput<Patient>
        name="foo"
        resourceType="Patient"
        label="Patient"
        value={value}
        onChange={(patient) => setValue(patient ? createReference(patient) : null)}
      />
      <Group mt="md">
        <Button variant="default" onClick={() => setValue(createReference(BartSimpson))}>
          Select Bart
        </Button>
        <Button variant="default" onClick={() => setValue(null)}>
          Clear
        </Button>
      </Group>
      <Code mt="md" block>
        {JSON.stringify(value)}
      </Code>
    </Document>
  );
}
