// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight, IconPhoto } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CustomerFeature } from '../../data/solutions-content';
import styles from './SolutionsCustomerCard.module.css';
import { TestimonialHeader } from './TestimonialHeader';

export interface SolutionsCustomerCardProps {
  readonly customer: CustomerFeature;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function SolutionsCustomerCard(props: SolutionsCustomerCardProps): JSX.Element {
  const { customer } = props;
  return (
    <div className={`${styles.card} ${customer.isPlaceholder ? styles.placeholder : ''}`}>
      <div className={styles.header}>
        <div className={styles.identity}>
          {customer.logoSrc ? (
            <img src={customer.logoSrc} alt={customer.name} className={styles.logo} loading="lazy" />
          ) : (
            <>
              {customer.isPlaceholder && <span className={styles.initialsMark}>{initials(customer.name)}</span>}
              <span className={styles.wordmark}>{customer.name}</span>
            </>
          )}
        </div>
        {customer.isPlaceholder && (
          <span className={styles.placeholderBadge}>Example &mdash; customer coming soon</span>
        )}
      </div>
      <div className={styles.screenshotFrame}>
        <div className={styles.browserBar}>
          <span />
          <span />
          <span />
        </div>
        {customer.videoSrc ? (
          <video
            className={styles.screenshot}
            src={customer.videoSrc}
            aria-label={customer.screenshotAlt ?? `${customer.name} product demo`}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : customer.screenshotSrc ? (
          <img
            src={customer.screenshotSrc}
            alt={customer.screenshotAlt ?? `${customer.name} product screenshot`}
            className={styles.screenshot}
            loading="lazy"
          />
        ) : (
          <div className={styles.screenshotEmpty}>
            <IconPhoto size={28} stroke={1.5} aria-hidden />
            <span>Product screenshot coming soon</span>
          </div>
        )}
      </div>
      <p className={styles.valueStatement}>{customer.valueStatement}</p>
      {customer.metrics && customer.metrics.length > 0 && (
        <div className={styles.metrics}>
          {customer.metrics.map((metric) => (
            <div key={metric.label} className={styles.metric}>
              <span className={styles.metricValue}>{metric.value}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
            </div>
          ))}
        </div>
      )}
      {customer.quote && (
        <blockquote className={styles.quote}>
          <p className={styles.quoteText}>&ldquo;{customer.quote.text}&rdquo;</p>
          {customer.quote.avatarSrc ? (
            <TestimonialHeader
              imgSrc={customer.quote.avatarSrc}
              name={customer.quote.attribution}
              title={customer.quote.title}
            />
          ) : (
            <footer className={styles.quoteAttribution}>
              &mdash; {customer.quote.attribution}
              {customer.quote.title ? `, ${customer.quote.title}` : ''}
            </footer>
          )}
        </blockquote>
      )}
      {customer.caseStudyUrl && (
        <Link to={customer.caseStudyUrl} className={styles.caseStudyLink}>
          Read the case study <IconArrowRight size={16} stroke={2.5} aria-hidden />
        </Link>
      )}
    </div>
  );
}
