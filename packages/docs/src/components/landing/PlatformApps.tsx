// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { JSX } from 'react';
import type { AppItem } from '../../data/platform-content';
import { FEATURED_APPS } from '../../data/platform-content';
import styles from './PlatformApps.module.css';

function ScreenshotPlaceholder({ caption }: { caption: string }): JSX.Element {
  return (
    <div className={styles.screenshotPlaceholder}>
      <div className={styles.placeholderChip}>placeholder</div>
      <div className={styles.placeholderCaption}>{caption}</div>
    </div>
  );
}

interface AppScreenshot {
  src: string;
  alt: string;
  zoom?: string;
}

function AppHeroImage({ src, alt, zoom }: AppScreenshot): JSX.Element {
  return (
    <div
      className={styles.appHeroContainer}
      role="img"
      aria-label={alt}
      style={{ backgroundImage: `url(${src})`, backgroundSize: zoom ? `${zoom} auto` : undefined }}
    />
  );
}

const APP_SCREENSHOTS: Record<string, AppScreenshot> = {
  provider: {
    src: '/img/provider/medplum-provider-app-cover-image.webp',
    alt: 'Medplum Provider App',
    zoom: '200%',
  },
  admin: {
    src: '/img/screenshots/app.medplum.png',
    alt: 'Medplum App — admin and developer console',
    zoom: '160%',
  },
};

/* Secondary, de-emphasized: the reference apps that ship with the platform. Smaller
   screenshot + compact copy so they read as supporting examples, not the main focus. */
function ReferenceAppCard({ app }: { app: AppItem }): JSX.Element {
  const screenshot = APP_SCREENSHOTS[app.id];
  return (
    <div className={styles.refCard}>
      {/* Name + tagline head the card so they label the screenshot below; body reads as a caption. */}
      <h4 className={styles.refName}>{app.name}</h4>
      <div className={styles.refTagline}>{app.tagline}</div>
      {screenshot ? <AppHeroImage {...screenshot} /> : <ScreenshotPlaceholder caption={`${app.name} — screenshot`} />}
      <p className={styles.refBody}>{app.body}</p>
    </div>
  );
}

export function PlatformApps(): JSX.Element {
  return (
    <div id="apps" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Apps</h2>
        <p className={styles.sectionLead}>
          Apps sit at the top of the stack. Most teams build their own — a custom EHR, patient portal, or data hub — on
          Medplum's FHIR data model, auth, and APIs. Medplum also ships full working reference apps you can pull from,
          learn from, or build on.
        </p>
      </div>

      {/* Primary focus: the custom application the team brings to market. */}
      <div className={styles.customHero}>
        <div className={styles.customHeroText}>
          <h3 className={styles.customHeroName}>Your Custom Applications</h3>
          <div className={styles.customHeroTagline}>The product you bring to market</div>
          <p className={styles.customHeroBody}>
            Your UI, your workflows, your brand — built on Medplum's FHIR data model, auth, and APIs. This is where most
            teams start, and where your product lives.
          </p>
          <Link to="/solutions" className={styles.customHeroLink}>
            See what teams have built <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ScreenshotPlaceholder caption="Your application — screenshot" />
      </div>

      {/* Secondary: reference implementations, demoted below the custom-app hero. */}
      <div className={styles.refIntro}>Ships with the platform</div>
      <div className={styles.refGrid}>
        {FEATURED_APPS.map((app) => (
          <ReferenceAppCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}
