// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconHelpCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleVisibilityChange = useCallback(
    (inView: boolean) => {
      if (!inView) {
        return;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      const startTime = Date.now();
      const decimalPlaces = value.includes('.') ? value.split('.')[1].length : 0;
      timerRef.current = setInterval(() => {
        const percentComplete = Math.min((Date.now() - startTime) / 2000, 1);
        setDisplayValue((percentComplete * targetNum).toFixed(decimalPlaces));
        if (percentComplete >= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 50);
    },
    [targetNum, value]
  );

  const { ref } = useInView({ triggerOnce: true, onChange: handleVisibilityChange });

  return (
    <div className={styles.value} ref={ref}>
      {displayValue}
      {suffix ?? ''}
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
    description: 'Operational reliability for mission-critical healthcare, backed by our enterprise SLA.',
  },
  {
    value: '2.5',
    suffix: 'B',
    label: 'Average API Calls per Month',
    description: 'Handling massive scale with consistent performance across the platform.',
  },
  {
    value: '120',
    suffix: 'M+',
    label: 'Custom Workflows',
    description: 'Powering over 120 million custom workflow actions designed for your requirements.',
  },
  {
    value: '20',
    suffix: 'M+',
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
          <Link to="/security" aria-label="Learn more about security" className={styles.securityLink}>
            <IconHelpCircle size={20} />
          </Link>
        </div>
        <ComplianceBadges />
      </div>
    </div>
  );
}
