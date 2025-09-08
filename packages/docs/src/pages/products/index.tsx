// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../../components/Container';
import { Jumbotron } from '../../components/landing/Jumbotron';
import styles from '../about.module.css';

export default function ProductsPage(): JSX.Element {
  return (
    <Layout title="Products">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1>Integrated Tools and Services</h1>
            <p className={styles.heroText}>
              Medplum is a platform of integrated, modular products designed to accelerate the development of secure and
              compliant healthcare applications. We provide the tools you need to manage patient data, streamline
              clinical workflows, and build advanced integrations, all on a single, unified platform.
            </p>
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Clinical Data Platform</h2>
            <p className={styles.heroText}>
              Your central nervous system for healthcare data. The Medplum Clinical Data Platform is a secure, compliant
              data repository and API that simplifies how you store, access, and manage patient information. Get a
              single source of truth for your business, with built-in access controls and a flexible data model designed
              for clinical workflows.
            </p>
            <br />
            <ul>
              <li>
                <strong>Clinical Data Repository (CDR):</strong> A single source of truth for all your patient data.
              </li>
              <li>
                <strong>API:</strong> A modern API for sending, receiving, and managing data.
              </li>
              <li>
                <strong>Search:</strong> Powerful, time-aware search to find the data you need, when you need it.
              </li>
              <li>
                <strong>Subscriptions:</strong> Event-driven notifications and webhooks for seamless integrations and
                automations.
              </li>
            </ul>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-interop-and-data-platform-square.webp"
              alt="Robot working in a medical office"
              width="450"
              height="450"
            />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Integrated Services</h2>
            <p className={styles.heroText}>
              Medplum is more than just a platform; it's a suite of pre-built, turnkey solutions that save you time and
              money. Our integrated services connect directly to a single, unified data model, eliminating the need for
              complex, manual integrations and ensuring a consistent experience across your application.
            </p>
            <br />
            <ul>
              <li>
                <strong>Questionnaires:</strong> Easily build and embed custom forms, surveys, and assessments to
                streamline patient intake and clinical workflows.
              </li>
              <li>
                <strong>Scheduling:</strong> Create custom scheduling pages and workflows for practitioners, locations,
                and patients with pre-built components or API-driven customization.
              </li>
              <li>
                <strong>ePrescribe & Medications:</strong> Connect to leading e-prescribing networks with a unified
                login and a single source of truth for patient prescription history.
              </li>
              <li>
                <strong>Labs & Diagnostics:</strong> Streamline lab orders and results with pre-built integrations to
                major lab networks, automatically normalizing all data into a clean, unified patient record.
              </li>
              <li>
                <strong>Billing:</strong> Simplify your revenue cycle with out-of-the-box integrations to leading
                billing providers and a single data model that automates reconciliation and claims submission.
              </li>
            </ul>
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
            <h2>Certification and Compliance</h2>
            <p className={styles.heroText}>
              Navigating the complexities of healthcare regulations can be a major barrier to market entry and growth.
              Medplum provides a fully ONC-certified platform, giving you a powerful, proven foundation for your
              application. This helps you avoid the financial penalties of non-compliance and ensures your software is
              audit-ready from day one, so you can focus on building your business, not on regulatory hurdles.
            </p>
            <br />
            <ul>
              <li>
                <strong>ONC Certification:</strong> Achieve regulatory compliance with our ONC-certified platform, which
                helps you meet the requirements for MIPS and other government incentives.
              </li>
              <li>
                <strong>HIPAA Compliance:</strong> Our platform is engineered to meet HIPAA standards, providing a
                secure, protected environment for patient data.
              </li>
              <li>
                <strong>Auditing and Logging:</strong> Built-in tools for tracking activity and connecting to your
                enterprise observability suite, giving you an audit trail for all key actions.
              </li>
            </ul>
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
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Application Development Toolkit</h2>
            <p className={styles.heroText}>
              Accelerate your development cycle with our comprehensive suite of tools. Our toolkit provides everything
              you need to build user-friendly, compliant healthcare applications, from authentication and UI components
              to server-side logic, all designed to work together perfectly.
            </p>
            <br />
            <ul>
              <li>
                <strong>Authentication and Authorization:</strong> Secure identity solutions for patient and provider
                logins.
              </li>
              <li>
                <strong>UI Component Library:</strong> Pre-built React components to quickly develop custom
                applications.
              </li>
              <li>
                <strong>Bots:</strong> Server-side automations that extend your application logic without the need for
                additional infrastructure.
              </li>
              <li>
                <strong>SDK:</strong> Client libraries that simplify interacting with the platform's APIs.
              </li>
              <li>
                <strong>Medplum App:</strong> An administrative tool for your team to manage data and troubleshoot
                issues.
              </li>
            </ul>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/hero/hero-homepage.webp" alt="Robot working in a medical office" width="394" height="450" />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h2>Enterprise Operations</h2>
            <p className={styles.heroText}>
              Build with confidence on a foundation of security, compliance, and control. Medplum provides the tools to
              manage your infrastructure, meet regulatory requirements, and ensure your applications are always
              auditable, scalable, and secure.
            </p>
            <br />
            <ul>
              <li>
                <strong>Compliance:</strong> An audit-ready platform that helps you meet strict industry standards like
                HIPAA.
              </li>
              <li>
                <strong>Auditing and Logging:</strong> Built-in tools for tracking activity and connecting to your
                enterprise observability suite.
              </li>
              <li>
                <strong>Self-Hosting and Deployment:</strong> Flexible hosting options, giving you the choice between
                our managed service or deploying in your own private cloud.
              </li>
              <li>
                <strong>Integrations and Interoperability:</strong> Tools to connect with other healthcare systems and
                services.
              </li>
            </ul>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/hero/hero-charts-and-graphs.webp"
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
