// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconChevronRight,
  IconHeartRateMonitor,
  IconMinus,
  IconPlus,
  IconStethoscope,
  IconTransform,
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
  imageSrc: string;
  imageClassName?: string;
}

const solutions: SolutionItem[] = [
  {
    title: 'Custom EHR',
    description: [
      'Ship a custom EHR in months, not years — built on the open-source Medplum Provider starter app',
      'Charting, scheduling, orders, and billing on a unified FHIR data model',
    ],
    icon: <IconHeartRateMonitor size={24} />,
    link: '/solutions',
    imageSrc: '/img/solutions/custom-ehr.webp',
  },
  {
    title: 'Patient Portal',
    description: [
      'A patient experience that feels like your brand, white-labeled on your own domain',
      'Records, scheduling, messaging, and intake powered by our open-source Foo Medical starter',
    ],
    icon: <IconUserHeart size={24} />,
    link: '/solutions',
    imageSrc: '/img/solutions/patient-engagement.webp',
    imageClassName: styles.imgPatientEngagement,
  },
  {
    title: 'Provider Portal',
    description: [
      'Give referring physicians and partner clinicians secure access — without standing up a whole EHR',
      'Notifications, threaded collaboration, and granular access controls out of the box',
    ],
    icon: <IconStethoscope size={24} />,
    link: '/solutions',
    // TODO(phase-b): swap to a dedicated provider-portal.webp asset
    imageSrc: '/img/solutions/scribe-agents.webp',
    imageClassName: styles.imgScribeAgents,
  },
  {
    title: 'Interoperability',
    description: [
      'A modern, cloud-native alternative to Mirth and Corepoint — HL7, C-CDA, FHIRcast, SFTP under one roof',
      'On-prem bridging via the Medplum Agent, transforms in TypeScript bots, audit-logged end to end',
    ],
    icon: <IconTransform size={24} />,
    link: '/solutions',
    // TODO(phase-b): swap to a dedicated interoperability.webp asset
    imageSrc: '/img/solutions/population-health.webp',
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
                      <div className={styles.imagePlaceholder}>
                        <img
                          src={solution.imageSrc}
                          alt=""
                          className={`${styles.imagePlaceholderImg} ${solution.imageClassName ?? ''}`}
                        />
                      </div>
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
