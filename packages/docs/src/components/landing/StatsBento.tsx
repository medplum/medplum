// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconHelpCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { ComplianceBadges } from './ComplianceBadges';
import styles from './StatsBento.module.css';

interface StatValueProps {
  readonly value: string;
  readonly suffix?: string;
}

function StatValue({ value, suffix }: StatValueProps): JSX.Element {
  const [displayValue, setDisplayValue] = useState('0');
  const targetNum = parseFloat(value);

  const handleVisibilityChange = useCallback(
    (inView: boolean) => {
      if (inView) {
        const startTime = Date.now();
        const timer = window.setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          let percentComplete = elapsedTime / 2000;
          if (percentComplete > 1) {
            percentComplete = 1;
            window.clearInterval(timer);
          }
          const current = percentComplete * targetNum;
          const decimalPlaces = value.includes('.') ? value.split('.')[1].length : 0;
          setDisplayValue(current.toFixed(decimalPlaces));
        }, 50);
      }
    },
    [targetNum, value]
  );

  const { ref } = useInView({ triggerOnce: true, onChange: handleVisibilityChange });

  return (
    <div className={styles.value} ref={ref}>
      {displayValue}{suffix ?? ''}
    </div>
  );
}

interface StatItem {
  value: string;
  suffix: string;
  label: string;
  description: string;
}

const stats: StatItem[] = [
  {
    value: '99.99',
    suffix: '%',
    label: 'System Uptime',
    description: 'Enterprise-grade reliability you can count on for mission-critical healthcare operations.',
  },
  {
    value: '120',
    suffix: 'K',
    label: 'API Calls per Month',
    description: 'Handling massive scale with consistent performance across the platform.',
  },
  {
    value: '120',
    suffix: 'm',
    label: 'Custom Workflows',
    description: 'Powering over 120 million custom workflow actions designed for your requirements.',
  },
  {
    value: '20',
    suffix: 'm',
    label: 'Active Patient Records',
    description: 'From startups to enterprises, Medplum facilitates care for over 20 million patients.',
  },
];

export function StatsBento(): JSX.Element {
  return (
    <div className={styles.bento}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.item}>
          <StatValue value={stat.value} suffix={stat.suffix} />
          <div className={styles.label}>{stat.label}</div>
          <p className={styles.description}>{stat.description}</p>
        </div>
      ))}
      <div className={`${styles.item} ${styles.itemFullWidth}`}>
        <div className={styles.label}>
          Certified, Compliant & Secure{' '}
          <IconHelpCircle
            size={20}
            style={{ color: 'var(--oc-gray-5)', cursor: 'pointer' }}
            onClick={() => window.open('/security')}
          />
        </div>
        <ComplianceBadges />
      </div>
    </div>
  );
}
