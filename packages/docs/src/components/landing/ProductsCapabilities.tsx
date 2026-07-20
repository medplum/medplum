// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { CAPABILITIES } from '../../data/products-content';
import { CAPABILITY_PREVIEWS } from './CapabilityPreviews';
import styles from './ProductsCapabilities.module.css';
import { ProductsSectionHeader } from './ProductsSectionHeader';

export function ProductsCapabilities(): JSX.Element {
  return (
    <div id="capabilities" className={styles.section}>
      <ProductsSectionHeader headline="Combine our capabilities for custom solutions">
        We&apos;ve solved the hard parts of clinical workflows and patient engagement for you—backed by first- and
        third-party integrations. Each capability ships with a recommended data model, set of operations, and UI
        components, but is still fully configurable for your most unique operations.
      </ProductsSectionHeader>

      {/* ---- bento grid ---- */}
      <div className={styles.bento}>
        {CAPABILITIES.map((cap) => {
          const Preview = CAPABILITY_PREVIEWS[cap.name];
          if (!Preview) {
            return null;
          }
          return (
            <div key={cap.name} className={styles.bentoCell}>
              <div className={styles.bentoText}>
                <h3 className={styles.bentoName}>{cap.name}</h3>
                <p className={styles.bentoShort}>{cap.short}</p>
              </div>
              <div className={styles.bentoImageClip}>
                <Preview />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
