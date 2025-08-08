// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { BackboneElementInput } from './BackboneElementInput';

export default {
  title: 'Medplum/BackboneElementInput',
  component: BackboneElementInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <BackboneElementInput typeName="PatientContact" path="Patient.contact" />
  </Document>
);
