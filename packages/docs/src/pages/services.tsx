import Layout from '@theme/Layout';
import React, { useEffect } from 'react';
import styles from './index.module.css';

export default function ServicesPage(): JSX.Element {
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
      <Layout title="Services">
        <div className={styles.heroSection}>
          <div className={styles.pagePadding}>
            <div className={styles.section}>
              <div className={styles.heroContent}>
                <h1 className={styles.heroTitle}>
                  Custom App
                  <br />
                  Development for
                  <br />
                  Healthcare
                </h1>
                <a href="https://forms.gle/2oetSEZUKxAf5nqP7" className={styles.getStartedButton}>
                  <div>Request a quote</div>
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
            <div className={styles.servicesSection}>
              <h2>Create beautifully connected end-to-end experiences that delight physicians, patients and staff.</h2>
            </div>
            <div className={styles.servicesSection}>
              <ul>
                <li>
                  Medplum's hosted service follows all security best practices, and comes with &nbsp;HIPAA and SOC2
                  compliance out of the box. We follow all OWASP security guidelines, and have been verified by multiple
                  penetration tests.
                </li>
                <li>
                  As your partner, we build a web application to your specification. We deliver high quality, modern
                  tested source code and can host your application, or you can deploy it on your private cloud.
                </li>
                <li>
                  We help digital health companies and providers create bespoke, connected experiences that give
                  customers what they want, when they want it, while providing HIPAA compliance and SOC2 certification.
                </li>
              </ul>
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.servicesGrid}>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/security.svg" loading="lazy" alt="Security icon" />
                </div>
                <h3>Security and Compliance</h3>
                <p>
                  All data is stored in FHIR, and we allow API access and streamlined payor and partner integrations
                  from day 1. If required, we can enforce Google Authentication. If we host, we can sign a HIPAA BAA and
                  have SOC2 Certification.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/icon.svg" loading="lazy" alt="Code icon" />
                </div>
                <h3>You own the code</h3>
                <p>
                  We will deliver high quality code to a repository you own. You can self-host your application or we
                  can host for you. We can set up your software development lifecycle, automatic deployment and testing.
                  We can provide training and documentation for your dev team.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/cog-icon.svg" loading="lazy" alt="Cog icon" />
                </div>
                <h3>Best for technology companies</h3>
                <p>
                  We serve companies who value a white-label, highly customized experience. Companies who consider
                  technology a core-competency, and would like to own their intellectual property will be best served.
                  Clients come to us if they want highly automated and scalable business processes are well served by
                  building a custom application.
                </p>
              </div>
              <div className={styles.featureCell}>
                <div className={styles.featureIcon}>
                  <img src="/img/icons/interoperability.svg" loading="lazy" alt="Interoperability icon" />
                </div>
                <h3>Interoperability ready</h3>
                <p>
                  With a FHIR compliant datastore and robust API support, we enable interoperability. Payors, billing
                  providers and partners often require integrations. Companies who know they want to be interoperable
                  someday or right away benefit from using our services.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}
