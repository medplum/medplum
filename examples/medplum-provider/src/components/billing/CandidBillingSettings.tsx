// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { IconBuilding, IconListCheck, IconShieldCheck, IconStethoscope, IconTag } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { BillingNavLink } from './BillingNavLink';
import { CandidBillingOrganizations } from './CandidBillingOrganizations';
import { CandidBillingPractitioners } from './CandidBillingPractitioners';
import classes from './CandidBillingSettings.module.css';
import { CandidImportedPayers } from './CandidImportedPayers';
import { ChargeItemDefinitions } from './ChargeItemDefinitions';
import { EligibilityServiceTypeSettings } from './EligibilityServiceTypeSettings';

/** The tabs of the billing settings. */
export type BillingSettingsTab = 'Organizations' | 'Practitioners' | 'Payers' | 'ChargeItems' | 'Eligibility';

/**
 * The tabs with the URL path each lives at, relative to the billing settings root. The Payers tab lists
 * Organizations, so its path names the resource type: `Payers/Organization`, and `Payers/Organization/:id` for an
 * open payer.
 */
const TABS: { label: string; value: BillingSettingsTab; path: string; icon: ReactNode }[] = [
  { label: 'Organizations', value: 'Organizations', path: 'Organizations', icon: <IconBuilding /> },
  { label: 'Practitioners', value: 'Practitioners', path: 'Practitioners', icon: <IconStethoscope /> },
  { label: 'Enrolled Payers', value: 'Payers', path: 'Payers/Organization', icon: <IconShieldCheck /> },
  { label: 'Charge Items', value: 'ChargeItems', path: 'ChargeItems', icon: <IconTag /> },
  { label: 'Eligibility', value: 'Eligibility', path: 'Eligibility', icon: <IconListCheck /> },
];

/**
 * Props for the billing settings. `baseUrl` is where they are mounted, without a trailing slash, and `path` is
 * the rest of the URL below it, so the selected tab and open modal survive a reload and can be linked to:
 * `Organizations`, `Organizations/:id`, `Organizations/new`, `Organizations/existing`, `Practitioners`,
 * `Practitioners/:id`, `Payers/Organization`, `Payers/Organization/:id`, `Payers/Organization/new` for the payer
 * directory, `ChargeItems`, `ChargeItems/:id` or `ChargeItems/new`. Payer directory search results are not
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
  return { tab: tab.value, resourceId: tab.value === 'Eligibility' ? undefined : rest[0] };
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
  return (
    <div className={classes.root}>
      <div className={classes.list}>
        <CandidBillingSettingsNav {...props} />
      </div>
      <div className={classes.panel}>
        <CandidBillingSettingsPanel path={props.path} onNavigate={props.onNavigate} />
      </div>
    </div>
  );
}

/**
 * The billing settings tabs as a vertical list of links, for a sidebar. Pair it with `CandidBillingSettingsPanel`.
 * @param props - The CandidBillingSettings React props.
 * @returns The tab list.
 */
export function CandidBillingSettingsNav(props: CandidBillingSettingsProps): JSX.Element {
  const { baseUrl, path, onNavigate } = props;
  const { tab: currentTab } = parseBillingSettingsPath(path);
  return (
    <Stack gap={2} role="tablist" aria-orientation="vertical">
      {TABS.map((t) => (
        <BillingNavLink
          key={t.value}
          href={`${baseUrl}/${t.path}`}
          label={t.label}
          icon={t.icon}
          active={currentTab === t.value}
          tabProps={{ id: `billing-settings-tab-${t.value}`, controls: 'billing-settings-panel' }}
          onNavigate={() => onNavigate(billingSettingsPath(t.value))}
        />
      ))}
    </Stack>
  );
}

/**
 * The selected billing settings tab's content.
 * @param props - The path and navigate callback, as for `CandidBillingSettings`.
 * @returns The tab panel.
 */
export function CandidBillingSettingsPanel(props: Omit<CandidBillingSettingsProps, 'baseUrl'>): JSX.Element {
  const { path, onNavigate } = props;
  const { tab: currentTab, resourceId } = parseBillingSettingsPath(path);
  const directory = useCandidPayerDirectory();

  const navigate = (tab: BillingSettingsTab, id?: string): void => onNavigate(billingSettingsPath(tab, id));

  return (
    <div role="tabpanel" id="billing-settings-panel" aria-labelledby={`billing-settings-tab-${currentTab}`}>
      {currentTab === 'Organizations' && (
        <CandidBillingOrganizations resourceId={resourceId} onNavigate={(id) => navigate('Organizations', id)} />
      )}
      {currentTab === 'Practitioners' && (
        <CandidBillingPractitioners resourceId={resourceId} onNavigate={(id) => navigate('Practitioners', id)} />
      )}
      {currentTab === 'Payers' && (
        <CandidImportedPayers
          directory={directory}
          resourceId={resourceId}
          onNavigate={(id) => navigate('Payers', id)}
        />
      )}
      {currentTab === 'ChargeItems' && (
        <ChargeItemDefinitions resourceId={resourceId} onNavigate={(id) => navigate('ChargeItems', id)} />
      )}
      {currentTab === 'Eligibility' && <EligibilityServiceTypeSettings />}
    </div>
  );
}
