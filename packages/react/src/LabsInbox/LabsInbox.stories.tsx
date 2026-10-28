// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, Stack, Text } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { createReference, parseSearchRequest } from '@medplum/core';
import { HomerDiagnosticReport, HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import type { LabItem, LabsInboxOrderModalProps, LabsInboxProps, LabTab } from './LabsInbox';
import { LabsInbox } from './LabsInbox';

export default {
  title: 'Medplum/LabsInbox',
  component: LabsInbox,
} as Meta;

const TAB_SEARCH: Record<LabTab, string> = {
  completed: 'DiagnosticReport?status=final,corrected,amended&_sort=-_lastUpdated&_count=20',
  open: 'ServiceRequest?status=active,draft,on-hold&_sort=-_lastUpdated&_count=20',
  revoked: 'ServiceRequest?status=revoked&_sort=-_lastUpdated&_count=20',
};

function LabsInboxStory(props: Pick<LabsInboxProps, 'activeTab' | 'selectedId' | 'renderOrderModal'>): JSX.Element {
  const [search, setSearch] = useState<SearchRequest>(() => parseSearchRequest(TAB_SEARCH[props.activeTab]));
  return (
    <Document>
      <div style={{ height: 800 }}>
        <LabsInbox
          patient={createReference(HomerSimpson)}
          search={search}
          getItemUri={(item: LabItem) => `/${item.resourceType}/${item.id}`}
          onChange={setSearch}
          completedUri={`/${TAB_SEARCH.completed}`}
          openUri={`/${TAB_SEARCH.open}`}
          revokedUri={`/${TAB_SEARCH.revoked}`}
          onNew={() => console.log('onNew')}
          {...props}
        />
      </div>
    </Document>
  );
}

function OrderModalStub({ opened, draftOrder, onClose, onSaved }: LabsInboxOrderModalProps): JSX.Element {
  return (
    <Modal opened={opened} onClose={onClose} title="Order Labs">
      <Stack>
        <Text>{draftOrder ? `Resuming draft ${draftOrder.id}` : 'New lab order'}</Text>
        <Button onClick={onSaved}>Submit</Button>
      </Stack>
    </Modal>
  );
}

export const Completed = (): JSX.Element => <LabsInboxStory activeTab="completed" selectedId={undefined} />;

export const CompletedWithSelection = (): JSX.Element => (
  <LabsInboxStory activeTab="completed" selectedId={HomerDiagnosticReport.id} />
);

export const Open = (): JSX.Element => <LabsInboxStory activeTab="open" selectedId={undefined} />;

export const OpenWithSelection = (): JSX.Element => (
  <LabsInboxStory activeTab="open" selectedId={HomerServiceRequest.id} />
);

export const Revoked = (): JSX.Element => <LabsInboxStory activeTab="revoked" selectedId={undefined} />;

export const WithOrderModal = (): JSX.Element => (
  <LabsInboxStory activeTab="open" selectedId={undefined} renderOrderModal={(p) => <OrderModalStub {...p} />} />
);
