// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight, IconPhoto } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CustomerFeature } from '../../data/solutions-content';
import styles from './SolutionsCustomerFeature.module.css';
import { SolutionsPayerIllustration } from './SolutionsPayerIllustration';
import { TestimonialHeader } from './TestimonialHeader';

export interface SolutionsCustomerFeatureProps {
  readonly customer: CustomerFeature;
}

export function SolutionsCustomerFeature(props: SolutionsCustomerFeatureProps): JSX.Element {
  const { customer } = props;
  // An illustrative mockup has no customer name to show — a normal customer-name
  // treatment (the big heading slot) doesn't fit a fabricated example.
  const showName = !customer.illustrativeMockup && !(customer.logoSrc && customer.logoHasName);
  return (
    <div
      id={customer.id}
      className={`${styles.feature} ${customer.isPlaceholder ? styles.placeholder : ''}`}
    >
      <div className={styles.header}>
        {customer.logoSrc && (
          <img
            src={customer.logoSrc}
            alt={customer.name}
            className={styles.logo}
            style={customer.logoScale ? { height: `${42 * customer.logoScale}px` } : undefined}
            loading="lazy"
          />
        )}
        {showName && <span className={styles.name}>{customer.name}</span>}
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
        {customer.illustrativeMockup ? (
          <SolutionsPayerIllustration />
        ) : customer.videoSrc ? (
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
            <IconPhoto size={32} stroke={1.5} aria-hidden />
            <span>Product screenshot coming soon</span>
          </div>
        )}
      </div>
      <div className={styles.text}>
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
        {customer.isPlaceholder && customer.placeholderCta && (
          <Link to={customer.placeholderCta.url} className={styles.caseStudyLink}>
            {customer.placeholderCta.label} <IconArrowRight size={16} stroke={2.5} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
