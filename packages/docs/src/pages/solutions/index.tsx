// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../../components/Container';
import { Jumbotron } from '../../components/landing/Jumbotron';
import styles from '../about.module.css';

export default function SolutionsPage(): JSX.Element {
  return (
    <Layout title="Solutions">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1>A Foundation for Growth</h1>
            <p className={styles.heroText}>
              Medplum provides a flexible, secure, and compliant foundation for building sophisticated healthcare
              applications. Whether you're creating a custom EHR, a patient portal, or a complex data integration hub,
              our platform gives you the power to innovate faster, meet market demands, and drive your business forward.
              Focus on your core mission while we handle the technical and regulatory complexities.
            </p>
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>
              <Link to="/solutions/custom-ehr">Custom Applications and Portals</Link>
            </h2>
            <p className={styles.heroText}>
              Stop forcing your workflows into off-the-shelf software. With Medplum, you can build and host custom EHRs,
              patient portals, and provider dashboards that are designed exactly for your team and your patients. Our
              platform provides the infrastructure, compliance, and tools you need to create sophisticated applications
              quickly, without compromising on efficiency or design.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-custom-apps-and-portals-square.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>
              <Link to="/solutions/interoperability">Interoperability and Data Platform</Link>
            </h2>
            <p className={styles.heroText}>
              Healthcare data is fragmented and complex. Medplum acts as your central interoperability hub, allowing you
              to connect disparate systems and data sources with ease. Our platform provides a modern, programmable
              alternative to legacy integration engines, so you can build scalable data pipelines, manage patient
              records, and ensure seamless communication across your entire health tech ecosystem.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-patient-allergies.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Specialty Clinic and Health Tech Solutions</h2>
            <p className={styles.heroText}>
              From clinical research to pediatric care, Medplum provides a flexible foundation for niche healthcare
              applications. Our platform is built on FHIR, giving you the flexibility to develop solutions for any
              specialty, without starting from scratch. Whether you're building a LIMS for a lab network or a remote
              patient monitoring program, Medplum gives you the tools to innovate faster and more safely.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-specialty-clinic-square.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Enterprise Master Patient Index (EMPI)</h2>
            <p className={styles.heroText}>
              Managing patient identity across fragmented systems is a major challenge. Medplum provides the tools to
              build a robust Enterprise Master Patient Index (EMPI), helping you unify patient records, improve data
              accuracy, and reduce manual workload. Our FHIR-native approach, coupled with powerful tooling for data
              accuracy scoring and human-in-the-loop merging, ensures you have a reliable and comprehensive view of
              every patient.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-empi-square.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Compliance and Security Platform</h2>
            <p className={styles.heroText}>
              Navigating healthcare compliance is complex and time-consuming. Medplum accelerates your development
              timeline by providing a secure, compliant infrastructure out of the box. Our platform is engineered to
              meet key regulatory requirements, including HIPAA, allowing you to focus on building your application, not
              on compliance audits. Build your next product knowing that data security and regulatory compliance are
              handled.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-compliance-and-security-square.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
      </Container>
    </Layout>
  );
}
