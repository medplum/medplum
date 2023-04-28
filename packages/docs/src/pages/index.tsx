import Layout from '@theme/Layout';
import React, { useEffect } from 'react';
import styles from './index.module.css';

export default function IndexPage(): JSX.Element {
  useEffect(() => {
    const navbar = document.querySelector('.navbar');
    function onScroll(): void {
      if (window.scrollY === 0) {
        navbar.classList.remove('onScroll');
      } else {
        navbar.classList.add('onScroll');
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="page">
      <Layout>
        <div className={styles.heroSection}>
          <div className={styles.pagePadding}>
            <div className={styles.section}>
              <div className={styles.heroContent}>
                <h1 className={styles.heroTitle}>
                  Fast and easy
                  <br />
                  healthcare dev
                </h1>
                <p className={styles.heroText}>
                  Medplum is a headless EHR that makes it easier to build healthcare apps quickly with less code.
                </p>
                <a href="/docs" className={styles.getStartedButton}>
                  <div>Get Started</div>
                  <img src="/img/btn-arrow.svg" loading="lazy" alt="Go arrow" />
                </a>
              </div>
              <div className={styles.heroImage}>
                <img src="/img/illustration-header.svg" loading="lazy" alt="Robot working in a medical office" />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.pagePadding}>
          <div className={styles.section}>
            <div className={styles.cardContainer}>
              <div className={styles.cardItem}>
                <h3>Get Started Fast</h3>
                <p>
                  Focus on delivering a <strong>quality healthcare experience</strong>, not on infrastructure.
                </p>
                <a href="/docs" className={styles.cardButton}>
                  <div>Learn more</div>
                  <img src="/img/arrow-small-btn.svg" loading="lazy" alt="Go arrow" />
                </a>
              </div>
              <div className={styles.cardItem}>
                <h3>Build with Modern Tools</h3>
                <p>
                  Use modern <strong>TypeScript</strong>, <strong>React</strong>, and <strong>Node</strong> to build
                  secure, data driven healthcare applications.
                </p>
                <a href="https://github.com/medplum/medplum" target="_blank" className={styles.cardButton}>
                  <div>Learn more</div>
                  <img src="/img/arrow-small-btn.svg" loading="lazy" alt="Go arrow" />
                </a>
              </div>
              <div className={styles.cardItem}>
                <h3>Streamline Integrations</h3>
                <p>
                  Store your data in standard-compliant format to <strong>simplify integration</strong> with healthcare
                  partners.
                </p>
                <a href="https://www.medplum.com/docs/fhir-basics" target="_blank" className={styles.cardButton}>
                  <div>Learn more</div>
                  <img src="/img/arrow-small-btn.svg" loading="lazy" alt="Go arrow" />
                </a>
              </div>
            </div>
          </div>
          <div className={styles.section}>
            <div fs-codehighlight-element="code">
              <pre>
                <code>
                  git clone https://github.com/medplum/medplum-hello-world.git{'\n'}
                  cd medplum-hello-world{'\n'}
                  npm i{'\n'}
                  npm run dev{'\n'}
                </code>
              </pre>
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>
                Focus on building apps, <br />
                not infrastructure
              </h2>
              <p>
                Medplum's platform provides developers with toolbox <br />
                to tame the complexity of healthcare development
              </p>
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.featureGrid}>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/security.svg" loading="lazy" alt="Security icon" />
                </div>
                <h3>Out of the box security</h3>
                <p>
                  Medplum's hosted service follows all security best practices, and comes with&nbsp;
                  <strong>HIPAA and SOC2 compliance</strong> out of the box.
                  <br />
                  <br />
                  We follow all OWASP security guidelines, and have been verified by multiple penetration tests.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/icon.svg" loading="lazy" alt="Code icon" />
                </div>
                <h3>Open Source</h3>
                <p>
                  Medplum's core technology is open source(Apache 2.0 license) and freely available in Github, so there
                  is <strong>no risk of vendor lock-in</strong>.<br />
                  <br />
                  Medplum also offers a cloud hosted version of its stack for organizations who do not want to store
                  sensitive data themselves.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/cog-icon.svg" loading="lazy" alt="Cog icon" />
                </div>
                <h3>Workflow Automation</h3>
                <p>
                  Healthcare operations involves tracking and managing complex tasks, from clinical procedures to
                  billing and documentation.
                  <em>
                    <br />
                  </em>
                  <br />
                  Medplum's workflow automation tools allow you to automate your healthcare workflows and{' '}
                  <strong>streamline your operations.</strong>
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/interoperability.svg" loading="lazy" alt="Interoperability icon" />
                </div>
                <h3>Future-proof Data Storage</h3>
                <p>
                  Healthcare data can be tricky. Medical edge cases are hard to anticipate, and data is fragmented
                  across ecosystem partners.
                  <br />
                  <br />
                  Medplum stores your data a FHIR-standard format that anticipates these nuances and{' '}
                  <strong>avoids costly re-writes</strong> down the line.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/user-interface.svg" loading="lazy" alt="Mouse icon" />
                </div>
                <h3>Healthcare UI Components</h3>
                <p>
                  <strong>Build patient experiences with less code</strong> by using Medplum's React Components to build
                  healthcare UIs.
                  <br />
                  <br />
                  Our un-opinionated components can be styled to match your branding and patient experience.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/clinical-logic.svg" loading="lazy" alt="Logic icon" />
                </div>
                <h3>Interoperability</h3>
                <p>
                  Building healthcare services involves partnering with multiple partners, including: payors, providers,
                  clinical labs, logistics providers, etc.
                  <br />
                  <br />
                  Medplum can <strong>share data with ecosystem partners</strong> in a variety of formats, including:
                  &nbsp;<strong>FHIR</strong>, <strong>HL7</strong>, <strong>CCDA</strong>, and <strong>SFTP</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}
