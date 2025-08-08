// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
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
