// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconBuildingBank,
  IconChartHistogram,
  IconChevronRight,
  IconFileTextSpark,
  IconFirstAidKit,
  IconHeartRateMonitor,
  IconReceiptDollar,
  IconRocket,
  IconUserHeart,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import type { SolutionCategory } from '../../data/solutions-content';
import styles from './SolutionsCategorySection.module.css';
import { SolutionsCustomerCard } from './SolutionsCustomerCard';
import { SolutionsCustomerFeature } from './SolutionsCustomerFeature';

const ICONS: Record<string, JSX.Element> = {
  IconBuildingBank: <IconBuildingBank size={24} />,
  IconChartHistogram: <IconChartHistogram size={24} />,
  IconFileTextSpark: <IconFileTextSpark size={24} />,
  IconFirstAidKit: <IconFirstAidKit size={24} />,
  IconHeartRateMonitor: <IconHeartRateMonitor size={24} />,
  IconReceiptDollar: <IconReceiptDollar size={24} />,
  IconRocket: <IconRocket size={20} />,
  IconUserHeart: <IconUserHeart size={24} />,
};

export interface SolutionsCategorySectionProps {
  readonly category: SolutionCategory;
  readonly index: number;
  readonly tinted?: boolean;
}

export function SolutionsCategorySection(props: SolutionsCategorySectionProps): JSX.Element {
  const { category, index, tinted } = props;
  const isSingle = category.customers.length === 1;
  return (
    <section id={category.id} className={`${styles.section} ${tinted ? styles.tinted : ''}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.iconTile}>{ICONS[category.icon]}</div>
            <h2 className={styles.title}>{category.title}</h2>
          </div>
          <p className={styles.tagline}>{category.tagline}</p>
          <p className={styles.description}>
            {category.description}
            {category.learnMoreUrl && (
              <>
                {' '}
                <Link to={category.learnMoreUrl} className={styles.learnMore}>
                  Learn more <IconChevronRight size={14} stroke={3} aria-hidden />
                </Link>
              </>
            )}
          </p>
        </div>
        {isSingle ? (
          <SolutionsCustomerFeature customer={category.customers[0]} reverse={index % 2 === 1} />
        ) : (
          <div className={styles.cardGrid}>
            {category.customers.map((customer) => (
              <SolutionsCustomerCard key={customer.id} customer={customer} />
            ))}
          </div>
        )}
        {category.accelerator && (
          <div className={styles.accelerator}>
            <div className={styles.acceleratorIcon}>{ICONS[category.accelerator.icon]}</div>
            <p className={styles.acceleratorText}>{category.accelerator.text}</p>
            <Link to={category.accelerator.linkUrl} className={styles.acceleratorLink}>
              {category.accelerator.linkLabel} <IconChevronRight size={14} stroke={3} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
