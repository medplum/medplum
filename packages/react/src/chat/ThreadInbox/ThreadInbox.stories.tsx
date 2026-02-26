// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../../Document/Document';
import { ThreadInbox } from './ThreadInbox';

export default {
  title: 'Medplum/Chat/ThreadInbox',
  component: ThreadInbox,
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <div style={{ height: 800 }}>
        <ThreadInbox
          query="_sort=-_lastUpdated"
          threadId={undefined}
          onNew={() => undefined}
          getThreadUri={(topic: Communication) => `/Communication/${topic.id}`}
          onChange={() => undefined}
          inProgressUri="/Communication?status=in-progress"
          completedUri="/Communication?status=completed"
        />
      </div>
    </Document>
  );
};
