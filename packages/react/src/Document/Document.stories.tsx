// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';

export default {
  title: 'Medplum/Document',
  component: Document,
} as Meta;

export const Basic = (): JSX.Element => <Document>Hello World</Document>;
