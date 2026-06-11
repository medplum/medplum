// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { FEATURED_APPS, TIER_INTRO_HEADLINE, TIER_INTRO_SUB } from '../../data/platform-content';
import styles from './PlatformThreeTierIntro.module.css';

/* Comprehensive inventories with shortened labels — every workflow and foundation is
   represented (full names live in the sections below). Each row is a click target
   that jumps to its section; hovering reveals the tier's verb line. */
const TIERS = [
  {
    key: 'apps',
    label: 'Apps',
    verb: 'What you ship — yours, plus references to fork.',
    rowClass: styles.tierRowApps,
    stripeClass: styles.tierStripeApps,
    items: ['Custom Apps', ...FEATURED_APPS.map((a) => a.name)],
  },
  {
    key: 'workflows',
    label: 'Workflows',
    verb: 'What you build on — hard parts already solved.',
    rowClass: styles.tierRowWorkflows,
    stripeClass: styles.tierStripeWorkflows,
    items: [
      'Intake',
      'Scheduling',
      'Charting',
      'Diagnostics',
      'Medications',
      'Care Coordination',
      'Messaging',
      'Billing',
    ],
  },
  {
    key: 'foundations',
    label: 'Foundations',
    verb: 'What you build with — open source, standards-based.',
    rowClass: styles.tierRowFoundations,
    stripeClass: styles.tierStripeFoundations,
    items: [
      'FHIR Datastore',
      'TypeScript SDK',
      'React Storybook',
      'Bots',
      'Subscriptions',
      'Medplum Bridge',
      'Medplum Auth',
      'Access Control',
    ],
  },
];

function jumpTo(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

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
            <button
              key={tier.key}
              type="button"
              className={`${styles.tierRow} ${tier.rowClass}`}
              onClick={() => jumpTo(tier.key)}
              aria-label={`Jump to the ${tier.label} section`}
            >
              <div className={`${styles.tierStripe} ${tier.stripeClass}`} />
              <div className={styles.tierLabel}>{tier.label}</div>
              <div className={styles.pills}>
                {tier.items.map((name) => (
                  <span key={name} className={styles.pill}>
                    {name}
                  </span>
                ))}
              </div>
              <div className={styles.rowReveal} aria-hidden="true">
                <span className={styles.rowVerb}>{tier.verb}</span>
                <span className={styles.rowArrow}>→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
