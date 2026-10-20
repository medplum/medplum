// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Group, Tabs, Tooltip } from '@mantine/core';
import { isAuxClick } from '@medplum/react';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ClaimQueueNav } from '../../components/billing/ClaimQueueNav';
import { ClaimsWorklist } from '../../components/billing/ClaimsWorklist';
import { RemitNav, RemitsWorklist } from '../../components/billing/RemitsWorklist';
import { getClaimQueue } from '../../components/billing/claimQueues';
import { getRemitView } from '../../components/billing/remitViews';
import { useClaimsAging } from '../../components/billing/useClaimsAging';
import classes from './BillingPage.module.css';

const BASE_URL = '/Billing';
const CLAIMS_URL = `${BASE_URL}/Claims`;
const REMITS_URL = `${BASE_URL}/Remits`;
/** Billing configuration lives in the app settings. */
const SETTINGS_URL = '/settings/billing';

type BillingSection = 'Claims' | 'Remits' | 'Settings';

// `Settings` is only recognized to redirect old `/Billing/Settings` links to the app settings.
const SECTIONS: BillingSection[] = ['Claims', 'Remits', 'Settings'];

interface BillingLocation {
  readonly section: BillingSection;
  /** The claims queue, or the remittance view. */
  readonly view?: string;
  /** The open claim, or the open remittance. */
  readonly resourceId?: string;
}

/**
 * Reads a billing path: `Claims/:queue/:claimId`, `Remits/:view/:remitId` or `Settings/...`.
 * @param path - The URL path below the billing root.
 * @returns The section and what's open in it.
 */
function parseBillingPath(path: string | undefined): BillingLocation {
  const [first, view, resourceId] = (path ?? '').split('/').filter(Boolean);
  const section = SECTIONS.find((s) => s.toLowerCase() === first?.toLowerCase()) ?? 'Claims';
  return { section, view, resourceId };
}

/**
 * The billing worklist. A left column holds the Claims and Remits tabs, a gear for the billing configuration, and
 * the section's queues; the selected queue fills the rest of the page.
 * @returns The BillingPage React node.
 */
export function BillingPage(): JSX.Element {
  const { '*': path } = useParams();
  const { search: query } = useLocation();
  const navigate = useNavigate();
  const { section, view, resourceId } = parseBillingPath(path);
  const [version, setVersion] = useState(0);
  const agingTotals = useClaimsAging(version);

  const go = (url: string): void => {
    navigate(url)?.catch(console.error);
  };
  const queueId = getClaimQueue(view).id;
  const remitViewId = getRemitView(view).id;

  if (section === 'Settings') {
    return <Navigate to={SETTINGS_URL} replace />;
  }

  return (
    <div className={classes.page}>
      <aside className={classes.sidebar}>
        <Group className={classes.sidebarHeader} justify="space-between" wrap="nowrap">
          <Tabs
            value={section}
            onChange={(value) => value && go(`${BASE_URL}/${value}`)}
            variant="unstyled"
            className="pill-tabs"
          >
            <Tabs.List>
              {(['Claims', 'Remits'] as const).map((s) => (
                <Tabs.Tab key={s} value={s}>
                  <Anchor
                    c="inherit"
                    underline="never"
                    lh={1}
                    href={`${BASE_URL}/${s}`}
                    onClick={(e) => {
                      // The tab's onChange navigates; only a click on the current tab needs to here, to reset it.
                      if (!isAuxClick(e)) {
                        e.preventDefault();
                        if (s === section) {
                          go(`${BASE_URL}/${s}`);
                        }
                      }
                    }}
                  >
                    {s}
                  </Anchor>
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
          <Tooltip label="Configuration" position="bottom" openDelay={500}>
            <ActionIcon
              component="a"
              href={SETTINGS_URL}
              variant="transparent"
              color="gray"
              radius="xl"
              size={32}
              className="outline-icon-button"
              aria-label="Configuration"
              onClick={(e) => {
                if (!isAuxClick(e)) {
                  e.preventDefault();
                  go(SETTINGS_URL);
                }
              }}
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div className={classes.sidebarNav}>
          {section === 'Claims' && (
            <ClaimQueueNav
              baseUrl={CLAIMS_URL}
              queueId={queueId}
              agingTotals={agingTotals}
              version={version}
              onNavigate={(id) => go(`${CLAIMS_URL}/${id}`)}
            />
          )}
          {section === 'Remits' && (
            <RemitNav baseUrl={REMITS_URL} viewId={remitViewId} onNavigate={(id) => go(`${REMITS_URL}/${id}`)} />
          )}
        </div>
      </aside>
      <main className={classes.content}>
        {section === 'Claims' && (
          <ClaimsWorklist
            queueId={queueId}
            claimId={resourceId}
            query={query}
            agingTotals={agingTotals}
            onNavigate={(next) => go(`${CLAIMS_URL}/${next}`)}
            onChanged={() => setVersion((v) => v + 1)}
          />
        )}
        {section === 'Remits' && (
          <div className={classes.padded}>
            <RemitsWorklist
              viewId={remitViewId}
              remitId={resourceId}
              query={query}
              onNavigate={(next) => go(`${REMITS_URL}/${next}`)}
              onOpenClaim={(claimId) => go(`${CLAIMS_URL}/all/${claimId}`)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
