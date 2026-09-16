// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { SolutionCategory } from '../../data/solutions-content';
import styles from './SolutionsCategorySection.module.css';
import { SolutionsCustomerFeature } from './SolutionsCustomerFeature';

export interface SolutionsCategorySectionProps {
  readonly category: SolutionCategory;
}

export function SolutionsCategorySection(props: SolutionsCategorySectionProps): JSX.Element {
  const { category } = props;
  const CategoryIcon = category.icon;
  const AcceleratorIcon = category.accelerator?.icon;
  return (
    <section id={category.id} className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrowRow}>
          <div className={styles.iconTile}>
            <CategoryIcon size={24} />
          </div>
          <span className={styles.eyebrow}>{category.title}</span>
        </div>
        <h2 className={styles.headline}>{category.tagline}</h2>
        <p className={styles.description}>
          {category.description}
          {category.learnMoreUrl && (
            <>
              {' '}
              <Link to={category.learnMoreUrl} className={styles.inlineLink}>
                Learn more <IconChevronRight size={14} stroke={3} aria-hidden />
              </Link>
            </>
          )}
        </p>
      </div>
      <div className={styles.customers}>
        {category.customers.map((customer) => (
          <SolutionsCustomerFeature key={customer.id} customer={customer} />
        ))}
      </div>
      {category.accelerator && AcceleratorIcon && (
        <div className={styles.accelerator}>
          <div className={styles.acceleratorIcon}>
            <AcceleratorIcon size={20} />
          </div>
          <p className={styles.acceleratorText}>{category.accelerator.text}</p>
          <Link to={category.accelerator.linkUrl} className={styles.inlineLink}>
            {category.accelerator.linkLabel} <IconChevronRight size={14} stroke={3} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
