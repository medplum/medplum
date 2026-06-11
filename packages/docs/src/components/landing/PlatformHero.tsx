// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight } from '@tabler/icons-react';
import type { CSSProperties, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { HERO_HEADLINE, HERO_SUB } from '../../data/platform-content';
import styles from './PlatformHero.module.css';

/* The hero plays a three-beat story when scrolled into view:
   1. the code "writes" (lines stagger in),
   2. the patient is found (patient card slides in after the searchOne block),
   3. the observation is published (vitals row lands + pulses after createResource).
   Without JS, or with prefers-reduced-motion, everything renders static. */

const CODE_LINES: JSX.Element[] = [
  // prettier-ignore
  <><span className={styles.cKeyword}>import</span>{' { '}<span className={styles.cClass}>MedplumClient</span>{' } '}<span className={styles.cKeyword}>from</span> <span className={styles.cString}>&apos;@medplum/core&apos;</span>;</>,
  <>{' '}</>,
  // prettier-ignore
  <><span className={styles.cKeyword}>const</span> medplum = <span className={styles.cKeyword}>new</span> <span className={styles.cClass}>MedplumClient</span>();</>,
  <>{' '}</>,
  // prettier-ignore
  <><span className={styles.cKeyword}>const</span> patient = <span className={styles.cKeyword}>await</span> medplum.<span className={styles.cMethod}>searchOne</span>(<span className={styles.cString}>&apos;Patient&apos;</span>, {'{'}</>,
  // prettier-ignore
  <>{'  '}identifier: <span className={styles.cString}>&apos;mrn-44218&apos;</span>,</>,
  <>{'}'});</>,
  <>{' '}</>,
  // prettier-ignore
  <><span className={styles.cKeyword}>await</span> medplum.<span className={styles.cMethod}>createResource</span>({'{'}</>,
  // prettier-ignore
  <>{'  '}resourceType: <span className={styles.cString}>&apos;Observation&apos;</span>,</>,
  // prettier-ignore
  <>{'  '}subject: {'{ '}reference: <span className={styles.cString}>`Patient/${'{'}</span>patient.id<span className={styles.cString}>{'}'}`</span>{' }'},</>,
  // prettier-ignore
  <>{'  '}code: {'{ '}text: <span className={styles.cString}>&apos;Systolic BP&apos;</span>{' }'},<span className={styles.cComment}> {'//'} LOINC 8480-6</span></>,
  // prettier-ignore
  <>{'  '}valueQuantity: {'{ '}value: <span className={styles.cNumber}>120</span>, unit: <span className={styles.cString}>&apos;mmHg&apos;</span>{' }'},</>,
  <>{'}'});</>,
];

function CodeSnippetCard(): JSX.Element {
  return (
    <div className={styles.codeCard}>
      <div className={styles.codeTitleBar}>
        <div className={`${styles.dot} ${styles.dotRed}`} />
        <div className={`${styles.dot} ${styles.dotYellow}`} />
        <div className={`${styles.dot} ${styles.dotGreen}`} />
        <span className={styles.codeFilename}>medplum-client.ts</span>
      </div>
      <pre className={styles.codeBody}>
        {CODE_LINES.map((line, i) => (
          <span
            key={i}
            className={styles.codeLine}
            style={{ '--line-delay': `${i * 110}ms` } as CSSProperties}
          >
            {line}
          </span>
        ))}
      </pre>
    </div>
  );
}

function PatientHeaderCard(): JSX.Element {
  return (
    <div className={styles.patientCard}>
      <div className={styles.patientHeader}>
        <div className={styles.patientAvatar}>JD</div>
        <div className={styles.patientMeta}>
          <div className={styles.patientName}>Jane Doe</div>
          <div className={styles.patientMrn}>mrn-44218</div>
        </div>
        <span className={styles.allergyPill}>⚠ Penicillin</span>
      </div>
      <div className={styles.patientFields}>
        <div>
          <div className={styles.fieldLabel}>DOB</div>
          <div className={styles.fieldValue}>Mar 14, 1992</div>
        </div>
        <div>
          <div className={styles.fieldLabel}>Age</div>
          <div className={styles.fieldValue}>34</div>
        </div>
        <div>
          <div className={styles.fieldLabel}>Sex</div>
          <div className={styles.fieldValue}>Female</div>
        </div>
      </div>
      <div className={styles.vitalsBar}>
        <div className={styles.vitalsDot} />
        <div className={styles.vitalsLabel}>Systolic BP</div>
        <div className={styles.vitalsReading}>
          <span className={styles.vitalsValue}>120</span>
          <span className={styles.vitalsMeta}>mmHg · just now</span>
        </div>
      </div>
    </div>
  );
}

function HeroStack(): JSX.Element {
  const stackRef = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    /* The animated parts are hidden by default in CSS (no JS-driven hiding, so no
       hydration flash). Reduced-motion users see everything statically via the CSS
       escape hatch; setting play here is harmless but skipping the observer is tidy. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlay(true);
      return undefined;
    }
    const node = stackRef.current;
    if (!node) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPlay(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={stackRef} className={`${styles.stack} ${play ? styles.play : ''}`}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.codeEditorWrapper}>
        <CodeSnippetCard />
      </div>
      <div className={styles.patientCardWrapper}>
        <PatientHeaderCard />
      </div>
    </div>
  );
}

export function PlatformHero(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div>
          <h1 className={styles.headline}>{HERO_HEADLINE}</h1>
          <p className={styles.lead}>{HERO_SUB}</p>
          <div className={styles.cta}>
            <Link to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a" className={styles.primaryButton}>
              Schedule a demo <IconArrowRight size={16} />
            </Link>
          </div>
        </div>
        <HeroStack />
      </div>
    </section>
  );
}
