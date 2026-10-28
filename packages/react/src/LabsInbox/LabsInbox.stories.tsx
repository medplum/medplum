// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, parseSearchRequest } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import type { LabItem } from './LabsInbox';
import { LabsInbox } from './LabsInbox';

export default {
  title: 'Medplum/LabsInbox',
  component: LabsInbox,
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <div style={{ height: 800 }}>
        <LabsInbox
          patient={createReference(HomerSimpson)}
          search={parseSearchRequest('DiagnosticReport?status=final&_sort=-_lastUpdated')}
          activeTab="completed"
          selectedId={undefined}
          getItemUri={(item: LabItem) => `/${item.resourceType}/${item.id}`}
          onChange={() => undefined}
          completedUri="/DiagnosticReport"
          openUri="/ServiceRequest"
          revokedUri="/ServiceRequest?status=revoked"
        />
      </div>
    </Document>
  );
};
