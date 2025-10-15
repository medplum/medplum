// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ContactDetail } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ContactDetailDisplay } from './ContactDetailDisplay';

export default {
  title: 'Medplum/ContactDetailDisplay',
  component: ContactDetailDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactDetailDisplay value={{ name: 'Foo', telecom: [{ value: 'homer@example.com' }] } as ContactDetail} />
  </Document>
);
