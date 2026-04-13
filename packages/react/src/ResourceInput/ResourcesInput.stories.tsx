// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { BartSimpson, HomerSimpson, LisaSimpson, MargeSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ResourcesInput } from './ResourcesInput';

export default {
  title: 'Medplum/ResourcesInput',
  component: ResourcesInput,
} as Meta;

export const Empty = (): JSX.Element => (
  <Document>
    <ResourcesInput name="foo" resourceType="Patient" placeholder="Search patients..." />
  </Document>
);

export const WithDefaultResources = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson, MargeSimpson]}
    />
  </Document>
);

export const WithDefaultReferences = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[createReference(HomerSimpson), createReference(MargeSimpson)]}
    />
  </Document>
);

export const ManyDefaults = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson, MargeSimpson, LisaSimpson, BartSimpson]}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <ResourcesInput
      disabled
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson, MargeSimpson]}
    />
  </Document>
);

export const WithMaxValues = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson]}
      maxValues={3}
      placeholder="Select up to 3 patients..."
    />
  </Document>
);

export const WithLabel = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson, MargeSimpson]}
      label="Patients"
    />
  </Document>
);

export const WithError = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Patient"
      defaultValue={[HomerSimpson]}
      error="At least two patients must be selected"
    />
  </Document>
);

export const Practitioners = (): JSX.Element => (
  <Document>
    <ResourcesInput
      name="foo"
      resourceType="Practitioner"
      label="Care team members"
      placeholder="Search practitioners..."
    />
  </Document>
);
