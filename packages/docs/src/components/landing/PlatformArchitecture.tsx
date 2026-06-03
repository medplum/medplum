// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import styles from './PlatformArchitecture.module.css';

export function PlatformArchitecture(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.headlineRow}>
          <h2 className={styles.headline}>Open source. FHIR-native. Entirely yours.</h2>
          <p className={styles.sub}>
            Every capability writes to the same FHIR datastore. Bots and the Agent connect inbound; subscriptions and
            integrations push outbound — Medplum, customer, and partner code all sharing one model.
          </p>
        </div>
        <div className={styles.placeholder}>
          <div className={styles.placeholderChip}>placeholder · 1120 × 480</div>
          <div className={styles.placeholderTitle}>Architecture diagram</div>
          <div className={styles.placeholderNote}>
            Diagram drops in here — Medplum / customer / partner code, the FHIR REST API surface, datastore, and
            bidirectional integrations.
          </div>
        </div>
      </div>
    </section>
  );
}
