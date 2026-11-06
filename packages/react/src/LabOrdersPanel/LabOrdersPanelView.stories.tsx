// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { parseSearchRequest } from '@medplum/core';
import type { DiagnosticReport, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerServiceRequest, HomerSimpson } from '@medplum/mock';
import { reactContext } from '@medplum/react-hooks';
import type { Decorator, Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  HealthGorillaCholesterolObservation,
  HealthGorillaClinicalPdfGroup,
  HealthGorillaClinicalPdfObservation,
  HealthGorillaHdlObservation,
  HealthGorillaLipidPanelDiagnosticReport,
  HealthGorillaLipidPanelGroup,
  HealthGorillaQuestDiagnosticReport,
  HealthGorillaQuestLabLenexa,
  HealthGorillaQuestLabSacramento,
  HealthGorillaQuestObservation1,
  HealthGorillaQuestObservation2,
  HealthGorillaQuestObservation3,
  HealthGorillaQuestObservationGroup1,
  HealthGorillaQuestObservationGroup2,
  HealthGorillaQuestObservationGroup3,
  HealthGorillaQuestParentLab,
  HealthGorillaQuestServiceRequest,
  HealthGorillaTriglyceridesObservation,
} from '../stories/healthgorilla';
import { LabDetailPaneView } from './LabDetailPaneView';
import { LabListItemView } from './LabListItemView';
import { LabOrderDetailsView } from './LabOrderDetailsView';
import type { LabItem, LabTab } from './LabOrdersPanelView';
import { LabOrdersPanelView } from './LabOrdersPanelView';
import { LabResultDetailsView } from './LabResultDetailsView';
import { LabResultListItemView } from './LabResultListItemView';

// The views hold no client: with the Medplum context cleared, any hook on it would throw.
const withoutMedplum: Decorator = (Story) => (
  <reactContext.Provider value={undefined}>
    <Story />
  </reactContext.Provider>
);

export default {
  title: 'Medplum/LabOrdersPanelView',
  component: LabOrdersPanelView,
  decorators: [withoutMedplum],
} as Meta;

const TAB_SEARCH: Record<LabTab, string> = {
  completed: 'DiagnosticReport?status=final,corrected,amended,preliminary,partial&_sort=-_lastUpdated&_count=20',
  open: 'ServiceRequest?status=active,draft,on-hold&_sort=-_lastUpdated&_count=20',
  revoked: 'ServiceRequest?status=revoked&_sort=-_lastUpdated&_count=20',
};

const lipidReport = HealthGorillaLipidPanelDiagnosticReport as WithId<DiagnosticReport>;
const questReport = HealthGorillaQuestDiagnosticReport as WithId<DiagnosticReport>;
const questOrder = HealthGorillaQuestServiceRequest as WithId<ServiceRequest>;
const openOrder = HomerServiceRequest as WithId<ServiceRequest>;

// Everything the reports reference, as a caller would have fetched it.
const resources: Resource[] = [
  HomerSimpson,
  DrAliceSmith,
  questOrder,
  HealthGorillaQuestParentLab,
  HealthGorillaQuestLabLenexa,
  HealthGorillaQuestLabSacramento,
  HealthGorillaQuestObservationGroup1,
  HealthGorillaQuestObservationGroup2,
  HealthGorillaQuestObservationGroup3,
  HealthGorillaQuestObservation1,
  HealthGorillaQuestObservation2,
  HealthGorillaQuestObservation3,
  HealthGorillaLipidPanelGroup,
  HealthGorillaCholesterolObservation,
  HealthGorillaHdlObservation,
  HealthGorillaTriglyceridesObservation,
  HealthGorillaClinicalPdfGroup,
  HealthGorillaClinicalPdfObservation,
];

function Panel(props: { activeTab: LabTab; items: LabItem[]; selected: LabItem }): JSX.Element {
  const { activeTab, items, selected } = props;
  const [search, setSearch] = useState<SearchRequest>(() => parseSearchRequest(TAB_SEARCH[activeTab]));
  return (
    <div style={{ height: '100vh', padding: '1em', boxSizing: 'border-box' }}>
      <LabOrdersPanelView
        items={items}
        total={items.length}
        loading={false}
        search={search}
        activeTab={activeTab}
        selectedId={selected.id}
        selected={selected}
        onChange={setSearch}
        completedUri="#completed"
        openUri="#open"
        revokedUri="#revoked"
        renderTabLink={(uri, linkProps) => <a href={uri} {...linkProps} />}
        renderItem={(item, isSelected) => (
          <a href={`#${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            {item.resourceType === 'DiagnosticReport' ? (
              <LabResultListItemView report={item} selected={isSelected} performer={HealthGorillaQuestParentLab} />
            ) : (
              <LabListItemView item={item} selected={isSelected} activeTab="open" requester={DrAliceSmith} />
            )}
          </a>
        )}
        renderDetail={(item) => (
          <LabDetailPaneView
            item={item}
            order={item.id === questReport.id ? questOrder : undefined}
            renderOrder={(order, selectedReport) => (
              <LabOrderDetailsView
                order={order}
                patient={HomerSimpson}
                requester={DrAliceSmith}
                report={selectedReport ? questReport : undefined}
                reportResources={resources}
                defaultTab={selectedReport ? 'report' : undefined}
                onRevoke={() => console.log('revoke', order.id)}
              />
            )}
            renderResult={(result) => <LabResultDetailsView result={result} resources={resources} />}
          />
        )}
        onOrder={() => console.log('Order Labs')}
      />
    </div>
  );
}

export const CompletedResult = (): JSX.Element => (
  <Panel activeTab="completed" items={[lipidReport, questReport]} selected={lipidReport} />
);

export const CompletedOrder = (): JSX.Element => (
  <Panel activeTab="completed" items={[lipidReport, questReport]} selected={questReport} />
);

export const Open = (): JSX.Element => <Panel activeTab="open" items={[openOrder]} selected={openOrder} />;
