// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ErrorBoundary } from './ErrorBoundary';

export default {
  title: 'Medplum/ErrorBoundary',
  component: ErrorBoundary,
} as Meta;

function ErrorComponent(): JSX.Element {
  throw new Error('Error');
}

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <div>Outside Error Boundary</div>
      <ErrorBoundary>
        <div>Inside Error Boundary</div>
        <ErrorComponent />
      </ErrorBoundary>
    </Document>
  );
};
