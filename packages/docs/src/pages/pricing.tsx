// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import type { JSX } from 'react';
import type { Entitlement } from '../components/Pricing/pricing-data';
import { groups, plans, salesUrl } from '../components/Pricing/pricing-data';
import { landingButtonClass } from '../components/landing/landingButtonClass';
import styles from './pricing.module.css';

function Mark({ included, label }: { readonly included: boolean; readonly label?: string }): JSX.Element {
  const Icon = included ? IconCheck : IconMinus;
  return (
    <span
      className={included ? styles.included : styles.excluded}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon size={20} stroke={3} />
    </span>
  );
}

function FeatureValue({ value }: { readonly value: Entitlement }): JSX.Element {
  if (typeof value === 'boolean') {
    return <Mark included={value} label={value ? 'Included' : 'Not included'} />;
  }
  if (typeof value === 'string') {
    return <>{value}</>;
  }
  return (
    <>
      {value.text} <Link href={value.link.href}>{value.link.text}</Link>
    </>
  );
}

export default function PricingPage(): JSX.Element {
  return (
    <Layout title="Pricing" description="Compare Medplum plans, features, support, and hosting options.">
      <main className="container margin-vert--xl">
        <header className="text--center padding-vert--lg margin-bottom--xl">
          <Heading as="h1" className={styles.heroTitle}>
            Build the Future of Healthcare
          </Heading>
          <p className={styles.lead}>Plans for startups, enterprises, and everyone in between.</p>
          <p>
            Questions about pricing? <Link href={salesUrl}>Contact Us</Link> or email{' '}
            <Link href="mailto:hello@medplum.com">hello@medplum.com</Link>.
          </p>
        </header>

        <Heading as="h2" id="hosted-plans" className={styles.sectionTitle}>
          Plans
        </Heading>
        <div className="row">
          {plans.map((plan) => (
            <div key={plan.id} className="col col--3 margin-bottom--lg">
              <div className={clsx('card', styles.planCard, plan.id !== 'free' && styles.paidCard)}>
                <div className="card__header">
                  <h3>{plan.name}</h3>
                </div>
                <div className="card__body">
                  <p>{plan.audience}</p>
                  {plan.details && <Link href={plan.details.href}>{plan.details.label}</Link>}
                </div>
                <div className="card__footer">
                  {plan.price && (
                    <p>
                      {plan.startingPrice && (
                        <>
                          Starts at
                          <br />
                        </>
                      )}
                      <span className={styles.price}>{plan.price}</span> {plan.period}
                    </p>
                  )}
                  <Link className={clsx(landingButtonClass('purple'), styles.cta)} href={plan.href}>
                    {plan.cta}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p>Paid plans include a usage allowance. Additional usage is billed separately.</p>

        <div className={clsx(styles.comparisonHeader, 'margin-top--xl')}>
          <Heading as="h2" id="comparison" className={styles.sectionTitle}>
            Plan Comparison
          </Heading>
          <div className={styles.legend}>
            <span>
              <Mark included /> Included
            </span>
            <span>
              <Mark included={false} /> Not Included
            </span>
          </div>
        </div>
        <table className={styles.comparison}>
          <thead>
            <tr>
              <th>Features</th>
              {plans.map((plan) => (
                <th key={plan.id}>
                  {plan.name}
                  {plan.price && (
                    <>
                      <br />
                      <small>
                        {plan.startingPrice && 'From '}
                        {plan.price}
                        {plan.period}
                      </small>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th colSpan={plans.length + 1}>
                  <span>{group.title}</span>
                </th>
              </tr>
              {group.note && (
                <tr>
                  <td colSpan={plans.length + 1}>
                    <span>
                      {group.note.prefix} <Link href={group.note.link.href}>{group.note.link.text}</Link>{' '}
                      {group.note.suffix}
                    </span>
                  </td>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr key={row.label}>
                  <td>
                    {row.docsHref ? <Link href={row.docsHref}>{row.label}</Link> : row.label}
                    {row.description && (
                      <>
                        <br />
                        <small>{row.description}</small>
                      </>
                    )}
                  </td>
                  {plans.map((plan) => (
                    <td key={plan.id}>
                      <FeatureValue value={row.values[plan.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p>
          Technical limits shown apply to Medplum-hosted deployments. See our{' '}
          <Link href="/docs/rate-limits">API rate limits</Link>.
        </p>
        <p>
          <strong>Enterprise Self-Hosting:</strong> Enterprise includes optional setup, provisioning, and upgrade
          assistance with temporary, customer-approved access. Your team handles ongoing operations, monitoring, and
          on-call response.
        </p>
        <p>
          Medplum’s hosted service can also be purchased through{' '}
          <Link href="https://aws.amazon.com/marketplace/pp/prodview-gfbi35l2l7mma">AWS Marketplace</Link>.
        </p>
      </main>
    </Layout>
  );
}
