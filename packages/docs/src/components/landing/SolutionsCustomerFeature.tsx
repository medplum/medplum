// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight, IconPhoto } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useInView } from 'react-intersection-observer';
import type { CustomerFeature } from '../../data/solutions-content';
import styles from './SolutionsCustomerFeature.module.css';
import { TestimonialHeader } from './TestimonialHeader';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Reads the viewer's reduced-motion preference.
 *
 * The server render has no media queries to consult, so its snapshot says "no
 * preference" and hydration corrects it. Anything gated on this must therefore be
 * safe to start un-animated.
 *
 * @returns True when the viewer has asked for reduced motion.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

interface CustomerVideoProps {
  readonly src: string;
  readonly poster?: string;
  readonly label: string;
}

/**
 * A product clip that fetches and plays only once it scrolls into view, and stays on
 * its poster frame for viewers who ask for reduced motion.
 *
 * Several of these sit below the fold. Autoplaying them all on load pulled megabytes
 * of video, and ran that many decoders, before the reader had scrolled to any of
 * them. `preload` cannot prevent that on its own, because `autoPlay` overrides it.
 *
 * @param props - The clip source, its poster still, and an accessible label.
 * @returns The video element.
 */
function CustomerVideo(props: CustomerVideoProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { ref: inViewRef, inView } = useInView({ rootMargin: '200px 0px' });
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldPlay = inView && !prefersReducedMotion;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (shouldPlay) {
      // Playback can still be refused (low power mode, for one), which leaves the
      // poster up. That is the intended fallback, so the rejection is not an error.
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [shouldPlay]);

  return (
    <video
      ref={(node) => {
        videoRef.current = node;
        inViewRef(node);
      }}
      className={styles.screenshot}
      src={props.src}
      poster={props.poster}
      aria-label={props.label}
      muted
      loop
      playsInline
      preload="none"
    />
  );
}

export interface SolutionsCustomerFeatureProps {
  readonly customer: CustomerFeature;
}

export function SolutionsCustomerFeature(props: SolutionsCustomerFeatureProps): JSX.Element {
  const { customer } = props;
  const showName = !(customer.logoSrc && customer.logoHasName);
  return (
    <div id={customer.id} className={`${styles.feature} ${customer.isPlaceholder ? styles.placeholder : ''}`}>
      <div className={styles.header}>
        {customer.logoSrc && (
          <img
            src={customer.logoSrc}
            alt={customer.name}
            className={styles.logo}
            style={
              customer.logoScale
                ? { height: `${42 * customer.logoScale}px`, maxWidth: `${220 * customer.logoScale}px` }
                : undefined
            }
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
        {customer.videoSrc ? (
          <CustomerVideo
            src={customer.videoSrc}
            poster={customer.posterSrc}
            label={customer.screenshotAlt ?? `${customer.name} product demo`}
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
