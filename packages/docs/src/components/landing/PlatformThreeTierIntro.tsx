// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { FEATURED_APPS, FOUNDATIONS, TIER_INTRO_HEADLINE, TIER_INTRO_SUB } from '../../data/platform-content';
import styles from './PlatformThreeTierIntro.module.css';

const WORKFLOW_PILLS = [
  'Intake',
  'Scheduling',
  'Charting',
  'Diagnostics',
  'Medications',
  'Care Coordination',
  'Billing',
  'Messaging',
];

const WORKFLOW_SUPPORT_CHIPS = ['Platform Features', 'Integrations'];

const TIERS = [
  {
    key: 'apps',
    label: 'Apps',
    rowClass: styles.tierRowApps,
    stripeClass: styles.tierStripeApps,
    items: ['Your custom apps', ...FEATURED_APPS.map((a) => a.name)],
  },
  {
    key: 'workflows',
    label: 'Workflows',
    rowClass: styles.tierRowWorkflows,
    stripeClass: styles.tierStripeWorkflows,
    items: WORKFLOW_PILLS,
    supportChips: WORKFLOW_SUPPORT_CHIPS,
  },
  {
    key: 'foundations',
    label: 'Foundations',
    rowClass: styles.tierRowFoundations,
    stripeClass: styles.tierStripeFoundations,
    items: FOUNDATIONS.map((f) => f.name),
  },
];

export function PlatformThreeTierIntro(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.headlineRow}>
          <h2 className={styles.headline}>{TIER_INTRO_HEADLINE}</h2>
          <p className={styles.sub}>{TIER_INTRO_SUB}</p>
        </div>
        <div className={styles.panel}>
          {TIERS.map((tier) => (
            <div key={tier.key} className={`${styles.tierRow} ${tier.rowClass}`}>
              <div className={`${styles.tierStripe} ${tier.stripeClass}`} />
              <div className={styles.tierLabel}>{tier.label}</div>
              <div className={styles.pills}>
                {tier.items.map((name) => (
                  <span key={name} className={styles.pill}>
                    {name}
                  </span>
                ))}
                {tier.supportChips && (
                  <div className={styles.supportTray}>
                    <span className={styles.supportTrayLabel}>Supported by</span>
                    {tier.supportChips.map((chip) => (
                      <span key={chip} className={styles.supportChip}>
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
