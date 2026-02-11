// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconChartHistogram,
  IconChevronRight,
  IconFileTextSpark,
  IconFirstAidKit,
  IconHeartRateMonitor,
  IconMinus,
  IconPlus,
  IconReceiptDollar,
  IconUserHeart,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SectionHeader } from './SectionHeader';
import styles from './SolutionAccordion.module.css';

interface SolutionItem {
  title: string;
  description: string[];
  icon: JSX.Element;
  link: string;
}

const solutions: SolutionItem[] = [
  {
    title: 'Custom EHR',
    description: [
      'Build the exact custom EHR your organization needs, tailored precisely to your unique workflows and specifications.',
      'Gain complete control over your clinical data and operations.',
    ],
    icon: <IconHeartRateMonitor size={24} />,
    link: '/solutions/custom-ehr',
  },
  {
    title: 'Patient Engagement',
    description: [
      'Deepen your connection with patients by creating custom, modern experiences that truly resonate.',
      'Drive better health outcomes through seamless and engaging interactions.',
    ],
    icon: <IconUserHeart size={24} />,
    link: '/solutions/patient-portal',
  },
  {
    title: 'Scribe & Agents',
    description: [
      'Go beyond simple transcription with agentic scribes that take action, not just notes.',
      'Elevate your AI capabilities to streamline operations and enhance decision-making.',
    ],
    icon: <IconFileTextSpark size={24} />,
    link: '/solutions',
  },
  {
    title: 'Population Health',
    description: [
      'Transform fragmented patient data into powerful insights for coordinated care delivery.',
      'Our platform empowers population health teams to improve outcomes and maximize shared savings.',
    ],
    icon: <IconChartHistogram size={24} />,
    link: '/solutions',
  },
  {
    title: 'Care Management',
    description: [
      'Free your care managers to focus on providing truly compassionate and personalized support.',
      'Streamline administrative tasks so they can dedicate more time to what matters most: patient well-being.',
    ],
    icon: <IconFirstAidKit size={24} />,
    link: '/solutions',
  },
  {
    title: 'Revenue Cycle Management',
    description: [
      'Design and automate custom routing and business rules that perfectly fit your financial operations.',
      'Optimize your revenue cycle for efficiency and maximum returns.',
    ],
    icon: <IconReceiptDollar size={24} />,
    link: '/solutions',
  },
];

export function SolutionAccordion(): JSX.Element {
  const [openIndex, setOpenIndex] = useState(0);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [contentHeights, setContentHeights] = useState<number[]>([]);

  useEffect(() => {
    const measureHeights = (): void => {
      setContentHeights(contentRefs.current.map((node) => node?.scrollHeight ?? 0));
    };

    measureHeights();
    window.addEventListener('resize', measureHeights);
    return () => window.removeEventListener('resize', measureHeights);
  }, []);

  const handleToggle = (index: number): void => {
    setOpenIndex(index === openIndex ? -1 : index);
  };

  return (
    <div className={styles.wrapper}>
      <SectionHeader>
        <h2>Solutions for all scopes and scales</h2>
        <p>
          Medplum powers a wide range of applications on a single, standards-based platform—giving your team the
          flexibility to ship and evolve your end-to-end care model.
        </p>
      </SectionHeader>
      <div className={styles.accordion}>
        {solutions.map((solution, index) => {
          const isOpen = index === openIndex;
          return (
            <div key={solution.title} className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
              <button
                type="button"
                className={styles.header}
                onClick={() => handleToggle(index)}
                aria-expanded={isOpen}
              >
                <div className={styles.headerLeft}>
                  <div className={styles.iconTile}>{solution.icon}</div>
                  <span className={styles.title}>{solution.title}</span>
                </div>
                <div className={styles.headerRight}>
                  <span className={`${styles.toggleIcon} ${isOpen ? styles.toggleHidden : ''}`}>
                    <IconPlus size={20} />
                  </span>
                  <span className={`${styles.toggleIcon} ${isOpen ? '' : styles.toggleHidden}`}>
                    <IconMinus size={20} />
                  </span>
                </div>
              </button>
              <div
                className={`${styles.content} ${isOpen ? styles.contentOpen : ''}`}
                style={{ maxHeight: isOpen ? `${contentHeights[index] ?? 0}px` : '0px' }}
              >
                <div
                  className={styles.contentInner}
                  ref={(node) => {
                    contentRefs.current[index] = node;
                  }}
                >
                  <div className={styles.contentBody}>
                    <div className={styles.text}>
                      <div className={styles.bulletList}>
                        {solution.description.map((bullet, i) => (
                          <div key={i} className={styles.bulletRow}>
                            <span className={styles.bulletIcon}>
                              <IconChevronRight size={16} stroke={4} style={{ marginTop: '4px' }} />
                            </span>
                            <span className={styles.bulletText}>{bullet}</span>
                          </div>
                        ))}
                      </div>
                      <Link href={solution.link} className={styles.learnMore}>
                        Learn More <IconChevronRight size={16} stroke={4} style={{ marginTop: '1px' }} />
                      </Link>
                    </div>
                    <div className={styles.image}>
                      <div className={styles.imagePlaceholder} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
