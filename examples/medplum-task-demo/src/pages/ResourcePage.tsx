// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Tabs, Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import {
  DefaultResourceTimeline,
  DiagnosticReportDisplay,
  Document,
  LinkTabs,
  ResourceTable,
  useResource,
} from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { ResourceHistoryTab } from '../components/ResourceHistoryTab';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const reference = { reference: resourceType + '/' + id };
  const resource = useResource(reference);
  let tabs = ['Details', 'Timeline', 'History'];
  // Special Case for Diagnostic Reporets
  if (resourceType === 'DiagnosticReport') {
    tabs = ['Report', ...tabs];
  }

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Title>{getDisplayString(resource)}</Title>
      <LinkTabs baseUrl={`/${resourceType}/${id}`} tabs={tabs}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <Paper mt={'lg'}>
            <ResourceTable key={`${resourceType}/${id}`} value={resource} ignoreMissingValues />
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <DefaultResourceTimeline resource={resource} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTab />
        </Tabs.Panel>
        <Tabs.Panel value="report">
          <Document>
            <DiagnosticReportDisplay value={resource as DiagnosticReport} />
          </Document>
        </Tabs.Panel>
      </LinkTabs>
    </Document>
  );
}
