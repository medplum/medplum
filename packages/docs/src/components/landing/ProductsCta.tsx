// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { JSX } from 'react';
import styles from './ProductsCta.module.css';

export function ProductsCta(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.headline}>Start building with Medplum today</h2>
        <p className={styles.body}>
          Apache 2.0 licensed. Managed cloud or self-hosted. The infrastructure, compliance, and integrations are
          handled — you ship the product.
        </p>
        <div className={styles.buttons}>
          <Link to="/docs" className={styles.whiteButton}>
            See Documentation
          </Link>
          <Link to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a" className={styles.purpleButton}>
            Book a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
