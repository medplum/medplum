// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { createReference, parseSearchRequest } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import type { LabItem, LabTab } from './LabOrdersPanel';
import { LabOrdersPanel } from './LabOrdersPanel';

export default {
  title: 'Medplum/LabOrdersPanel',
  component: LabOrdersPanel,
} as Meta;

const TAB_SEARCH: Record<LabTab, string> = {
  completed: 'DiagnosticReport?status=final,corrected,amended&_sort=-_lastUpdated&_count=20',
  open: 'ServiceRequest?status=active,draft,on-hold&_sort=-_lastUpdated&_count=20',
  revoked: 'ServiceRequest?status=revoked&_sort=-_lastUpdated&_count=20',
};

function LabOrdersPanelStory(props: { activeTab: LabTab; selectedId: string | undefined }): JSX.Element {
  const [search, setSearch] = useState<SearchRequest>(() => parseSearchRequest(TAB_SEARCH[props.activeTab]));
  return (
    <Document>
      <div style={{ height: 800 }}>
        <LabOrdersPanel
          patient={createReference(HomerSimpson)}
          search={search}
          getItemUri={(item: LabItem) => `/${item.resourceType}/${item.id}`}
          onChange={setSearch}
          completedUri={`/${TAB_SEARCH.completed}`}
          openUri={`/${TAB_SEARCH.open}`}
          revokedUri={`/${TAB_SEARCH.revoked}`}
          {...props}
        />
      </div>
    </Document>
  );
}

// The mock report is based on an order, which shows the order view; a report without one shows the report itself.
const StandaloneReport: WithId<DiagnosticReport> = {
  ...HomerDiagnosticReport,
  id: 'lab-orders-panel-report',
  basedOn: undefined,
  issued: '2020-01-02T12:00:00Z',
};

export const Completed = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  // Upsert by id so revisiting the story doesn't add duplicates.
  useEffect(() => {
    medplum
      .updateResource(StandaloneReport)
      .then(() => setLoaded(true))
      .catch(console.error);
  }, [medplum]);

  return loaded ? <LabOrdersPanelStory activeTab="completed" selectedId={StandaloneReport.id} /> : <></>;
};

export const Open = (): JSX.Element => <LabOrdersPanelStory activeTab="open" selectedId={HomerServiceRequest.id} />;
