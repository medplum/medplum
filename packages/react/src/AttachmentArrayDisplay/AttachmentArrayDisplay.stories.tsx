// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Attachment } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { AttachmentArrayDisplay } from './AttachmentArrayDisplay';

export default {
  title: 'Medplum/AttachmentArrayDisplay',
  component: AttachmentArrayDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AttachmentArrayDisplay
      values={
        [
          { url: 'http://example.com/file1', title: 'file1.txt' },
          { url: 'http://example.com/file2', title: 'file2.png' },
        ] as Attachment[]
      }
    />
  </Document>
);
