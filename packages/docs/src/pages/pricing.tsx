import Link from '@docusaurus/Link';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import Layout from '@theme/Layout';
import { JSX, useState } from 'react';
import { Entitlement, groups, PlanId, plans, salesUrl } from '../components/Pricing/pricing-data';
import { LandingButton } from '../components/landing/LandingButton';
import styles from './pricing.module.css';

function StatusIcon({ included }: { readonly included: boolean }): JSX.Element {
  const Icon = included ? IconCheck : IconMinus;
  return <Icon size={22} stroke={3} aria-hidden="true" />;
}

function FeatureValue({ value }: { readonly value: Entitlement }): JSX.Element {
  const included = value.text === 'Included';
  const excluded = value.text === 'Not Included';
  return included || excluded ? (
    <span className={included ? styles.included : styles.excluded}>
      <StatusIcon included={included} />
      <span className={styles.srOnly}>{value.text}</span>
    </span>
  ) : (
    <span>{value.text}</span>
  );
}

export default function PricingPage(): JSX.Element {
  const [mobilePlan, setMobilePlan] = useState<PlanId>('free');
  return (
    <Layout title="Pricing" description="Compare Medplum plans, features, support, and hosting options.">
      <main className={styles.page}>
        <header className={`${styles.shell} ${styles.hero}`}>
          <h1 className={styles.heroTitle}>Build the Future of Healthcare</h1>
          <p className={styles.intro}>Plans for startups, enterprises, and everyone in between.</p>
          <p className={styles.contactIntro}>
            Questions about pricing? <Link href={salesUrl}>Contact Us</Link> or email{' '}
            <Link href="mailto:hello@medplum.com">hello@medplum.com</Link>.
          </p>
        </header>
        <section className={styles.shell} id="hosted-plans" aria-labelledby="hosted-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="hosted-heading">Plans</h2>
            </div>
            <Link href={salesUrl}>Contact Us</Link>
          </div>
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article key={plan.id} className={`${styles.planCard}${plan.id === 'free' ? ` ${styles.freeCard}` : ''}`}>
                <h3>{plan.name}</h3>
                <p className={styles.audience}>
                  {plan.audience}
                  {plan.details && (
                    <Link className={styles.planDetails} href={plan.details.href}>
                      {plan.details.label}
                    </Link>
                  )}
                </p>
                {plan.price ? (
                  <p className={styles.price}>
                    <span className={styles.priceQualifier}>{plan.startingPrice ? 'Starts at' : '\u00a0'}</span>
                    {plan.price}
                    <span>{plan.period}</span>
                  </p>
                ) : (
                  <div className={styles.priceSpacer} aria-hidden="true" />
                )}
                <LandingButton variant="purple" to={plan.href}>
                  {plan.cta}
                </LandingButton>
              </article>
            ))}
          </div>
          <p className={styles.billingNote}>
            Paid plans include a usage allowance. Additional usage is billed separately.
          </p>
        </section>
        <section className={`${styles.shell} ${styles.section}`} id="comparison" aria-labelledby="comparison-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="comparison-heading">Plan Comparison</h2>
            </div>
            <div className={styles.legend} aria-label="Comparison key">
              <span>
                <span className={styles.included} aria-hidden="true">
                  <StatusIcon included />
                </span>{' '}
                Included
              </span>
              <span>
                <span className={styles.excluded} aria-hidden="true">
                  <StatusIcon included={false} />
                </span>{' '}
                Not Included
              </span>
            </div>
          </div>
          <div className={styles.mobilePicker}>
            <label htmlFor="pricing-plan">Plan to Compare</label>
            <select
              id="pricing-plan"
              value={mobilePlan}
              onChange={(event) => setMobilePlan(event.target.value as PlanId)}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.comparison}>
            <table>
              <caption className={styles.srOnly}>
                Medplum plan inclusions. Check marks mean included; minus signs mean not included. On small screens,
                select a plan to view.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Features</th>
                  {plans.map((plan) => (
                    <th key={plan.id} scope="col" className={mobilePlan !== plan.id ? styles.mobileHidden : undefined}>
                      {plan.name}
                      {plan.price && (
                        <span className={styles.columnPrice}>
                          {plan.startingPrice && 'From '}
                          {plan.price}
                          {plan.period}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.title}>
                  <tr className={styles.groupRow}>
                    <th colSpan={plans.length + 1} scope="rowgroup">
                      {group.title}
                    </th>
                  </tr>
                  {group.title === 'Compliance and Agreements' && (
                    <tr className={styles.groupNote}>
                      <td colSpan={plans.length + 1}>
                        See <Link href="/docs/compliance">Medplum’s compliance documentation</Link> for our SOC 2 Type
                        II audit, HITRUST e1 certification for our AWS-hosted platform, and ONC-certified product.
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">
                        {row.docsHref ? (
                          <Link className={styles.featureLink} href={row.docsHref}>
                            {row.label}
                          </Link>
                        ) : (
                          row.label
                        )}
                        {row.description && <span className={styles.rowDescription}>{row.description}</span>}
                      </th>
                      {plans.map((plan) => (
                        <td key={plan.id} className={mobilePlan !== plan.id ? styles.mobileHidden : undefined}>
                          <FeatureValue value={row.values[plan.id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className={styles.billingNote}>
            Hosted plans are subject to <Link href="/docs/rate-limits">API rate limits</Link>.
          </p>
          <p className={styles.billingNote}>
            Medplum’s hosted service can also be purchased through{' '}
            <Link href="https://aws.amazon.com/marketplace/pp/prodview-gfbi35l2l7mma">AWS Marketplace</Link>.
          </p>
        </section>
      </main>
    </Layout>
  );
}
