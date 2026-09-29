// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Tabs } from '@mantine/core';
import { isAuxClick } from '@medplum/react';
import type { JSX } from 'react';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { CandidBillingOrganizations } from './CandidBillingOrganizations';
import { CandidBillingPractitioners } from './CandidBillingPractitioners';
import { CandidDirectoryPayers } from './CandidDirectoryPayers';
import { CandidImportedPayers } from './CandidImportedPayers';

/** The tabs of the billing settings. */
export type BillingSettingsTab = 'Organizations' | 'Practitioners' | 'Payers' | 'Directory';

/**
 * The tabs with the URL path each lives at, relative to the billing settings root. The Payers tab lists
 * Organizations, so its path names the resource type: `Payers/Organization`, and `Payers/Organization/:id` for an
 * open payer.
 */
const TABS: { label: string; value: BillingSettingsTab; path: string }[] = [
  { label: 'Billing Organizations', value: 'Organizations', path: 'Organizations' },
  { label: 'Billing Practitioners', value: 'Practitioners', path: 'Practitioners' },
  { label: 'Enrolled Payers', value: 'Payers', path: 'Payers/Organization' },
  { label: 'Payer Directory', value: 'Directory', path: 'Directory' },
];

/**
 * Props for the billing settings. `baseUrl` is where they are mounted, without a trailing slash, and `path` is
 * the rest of the URL below it, so the selected tab and open modal survive a reload and can be linked to:
 * `Organizations`, `Organizations/:id`, `Organizations/new`, `Organizations/existing`, `Practitioners`,
 * `Practitioners/:id`,
 * `Payers/Organization`, `Payers/Organization/:id` or `Directory`. Payer directory search results are not
 * persisted, so their details modal stays off the URL. Tabs are links under `baseUrl`, so they can be opened in
 * a new window; the component never navigates itself but calls `onNavigate` with the path below `baseUrl` the
 * URL should move to. Paths are matched case-insensitively and an unknown one falls back to the first tab.
 */
export interface CandidBillingSettingsProps {
  readonly baseUrl: string;
  readonly path?: string;
  readonly onNavigate: (path: string) => void;
}

interface BillingSettingsLocation {
  readonly tab: BillingSettingsTab;
  readonly resourceId?: string;
}

/**
 * Reads the tab and the linked resource out of a billing settings path. A payer ID without the `Organization`
 * segment is accepted too.
 * @param path - The URL path below the billing settings root.
 * @returns The tab and, when the path opens one, the ID of the resource it opens.
 */
function parseBillingSettingsPath(path: string | undefined): BillingSettingsLocation {
  const segments = (path ?? '').split('/').filter(Boolean);
  const tab = TABS.find((t) => t.value.toLowerCase() === segments[0]?.toLowerCase()) ?? TABS[0];
  const rest = segments.slice(1);
  if (tab.value === 'Payers' && rest[0]?.toLowerCase() === 'organization') {
    rest.shift();
  }
  return { tab: tab.value, resourceId: tab.value === 'Directory' ? undefined : rest[0] };
}

/**
 * Builds the billing settings path for a tab and, optionally, the resource to open on it.
 * @param tab - The tab.
 * @param resourceId - The ID of the resource to open, or `NEW_BILLING_ORGANIZATION_ID`.
 * @returns The URL path below the billing settings root.
 */
function billingSettingsPath(tab: BillingSettingsTab, resourceId?: string): string {
  const base = TABS.find((t) => t.value === tab)?.path ?? TABS[0].path;
  return resourceId ? `${base}/${resourceId}` : base;
}

export function CandidBillingSettings(props: CandidBillingSettingsProps): JSX.Element {
  const { baseUrl, path, onNavigate } = props;
  const { tab: currentTab, resourceId } = parseBillingSettingsPath(path);
  const directory = useCandidPayerDirectory();

  const navigate = (tab: BillingSettingsTab, id?: string): void => onNavigate(billingSettingsPath(tab, id));
  const linkedId = (tab: BillingSettingsTab): string | undefined => (currentTab === tab ? resourceId : undefined);

  return (
    <Tabs value={currentTab} onChange={(value) => navigate((value as BillingSettingsTab | null) ?? TABS[0].value)}>
      <Tabs.List>
        {TABS.map((t) => (
          <Tabs.Tab key={t.value} value={t.value}>
            <Anchor
              c="inherit"
              underline="never"
              lh={1}
              href={`${baseUrl}/${t.path}`}
              onClick={(e) => !isAuxClick(e) && e.preventDefault()}
            >
              {t.label}
            </Anchor>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="Organizations" pt="md">
        <CandidBillingOrganizations
          resourceId={linkedId('Organizations')}
          onNavigate={(id) => navigate('Organizations', id)}
        />
      </Tabs.Panel>
      <Tabs.Panel value="Practitioners" pt="md">
        <CandidBillingPractitioners
          resourceId={linkedId('Practitioners')}
          onNavigate={(id) => navigate('Practitioners', id)}
        />
      </Tabs.Panel>
      <Tabs.Panel value="Payers" pt="md">
        <CandidImportedPayers
          directory={directory}
          resourceId={linkedId('Payers')}
          onNavigate={(id) => navigate('Payers', id)}
        />
      </Tabs.Panel>
      <Tabs.Panel value="Directory" pt="md">
        <CandidDirectoryPayers directory={directory} />
      </Tabs.Panel>
    </Tabs>
  );
}
