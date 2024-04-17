import Layout from '@theme/Layout';
import { CardContainer } from '../components/CardContainer';
import { Container } from '../components/Container';
import { ProfileCard } from '../components/ProfileCard';
import { Feature, FeatureGrid } from '../components/landing/FeatureGrid';
import { Jumbotron } from '../components/landing/Jumbotron';
import { Section } from '../components/landing/Section';
import styles from './about.module.css';

export default function EnterprisePage(): JSX.Element {
  return (
    <Layout title="Medplum Enterprise">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Build healthcare applications for enterprise</h1>
            <p className={styles.heroText}>
              Medplum is a platform with powerful primitives and pre-built integrations that scales to meet the needs of
              your organization.
            </p>
            <a href="https://cal.com/medplum/demo" className={styles.getStartedButton}>
              <div>Book a demo</div>
              <img src="/img/btn-arrow.svg" alt="Go arrow" width="32" height="32" />
            </a>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/about-jumbotron.svg" alt="Medplum robot coding" width="488" height="384" />
          </div>
        </Jumbotron>
        <Section>
          <FeatureGrid columns={3}>
            <Feature title="Security" imgSrc="/img/icons/security.svg">
              Monitor data access and authentication in real time using a CISO Suite that's integrated with common
              observability tools like Datadog and Sumo Logic.
            </Feature>
            <Feature title="Identity and Access" imgSrc="/img/icons/identity.svg">
              Fine grained access controls enable 50 state workflows, partnerships or multiple physician groups to
              collaborate on the same platform using SSO.
            </Feature>
            <Feature title="Compliance" imgSrc="/img/icons/shield.svg">
              Certify CMS, attest ONC Compliance, enable CMS 9115, get CLIA/CAP certification, SOC 2, HITRUST, certify
              HIPAA and more.
            </Feature>
            <Feature title="Lab and Imaging" imgSrc="/img/icons/lab-imaging.svg">
              Send orders and receive results from lab and imaging providers. Use vendors with the best service and
              prices.
            </Feature>
            <Feature title="HIE" imgSrc="/img/icons/hie.svg">
              Request records from and write records to Health Information Exchanges like CareQuality and Commonwell.
            </Feature>
            <Feature title="Value Based Care" imgSrc="/img/icons/value-based-care.svg">
              Report HEDIS, CMS Measures, MIPS and more. Compute RAF scores for your patients.
            </Feature>
            <Feature title="Workforce" imgSrc="/img/icons/workforce.svg">
              Manage and store credentials for practitioners. Track productivity, turnaround times and billables for
              your team and partners.
            </Feature>
            <Feature title="Data Analytics" imgSrc="/img/icons/data-analytics.svg">
              Synchronize data to popular tools like Snowflake, Datadog, Redshift or any Open Telemetry (oTel) platform.
            </Feature>
            <Feature title="Payors" imgSrc="/img/icons/payors.svg">
              Robust reporting for insurance coverage by payor and patient.
            </Feature>
            <Feature title="EMPI" imgSrc="/img/icons/empi.svg">
              Reports, monitoring and deduplication workflows for your Enterprise Master Patient Index (EMPI).
            </Feature>
            <Feature title="Service Menu" imgSrc="/img/icons/user-interface.svg">
              Manage, version and oversee your healthcare service menu. Allow partners to send referrals
              programmaticaly.
            </Feature>
            <Feature title="Claims Dashboard" imgSrc="/img/icons/claims-dashboard.svg">
              View, monitor and troubleshoot claims in real time. Track and report on claims by payor and patient.
            </Feature>
          </FeatureGrid>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Security Dashboard</h1>
            <p className={styles.heroText}>
              Medplum provides the Chief Information Security Officer (CISO) a centrailzed view of an organization's
              cybersecurity posture. The dashboard includes key metrics such as threat alerts, compliance status, and
              access levels, enabling quick decision-making.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/blog/ciso-dashboard.jpg" alt="Medplum robot coding" width="488" height="384" />
          </div>
        </Jumbotron>
        <Jumbotron>
          <div className={styles.heroImage}>
            <img src="/img/infrastructure-jumbotron.svg" alt="Medplum robot coding" width="488" height="384" />
          </div>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Enterprise Identity Management</h1>
            <p className={styles.heroText}>
              Connect multiplie identity prociders and provision identities programmatically across your health record
              system. Use SCM administration for robust and compliant identity administration.
            </p>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Okta"
              title="Identity, security"
              imgUrl="/img/blog/okta-logo.png"
              webUrl="/docs/auth/methods/domain-level-identity-providers"
            />
            <ProfileCard
              name="Azure SSO"
              title="Identity, security"
              imgUrl="/img/blog/azure-logo.png"
              webUrl="/docs/integration#first-party-integrations"
            />
            <ProfileCard
              name="Google SSO"
              title="Identity, security"
              imgUrl="/img/blog/google-logo.jpeg"
              webUrl="/docs/auth/methods/google-auth"
            />
          </CardContainer>
        </Section>
        <Jumbotron>
          <div className={styles.heroImage}>
            <img src="/img/infrastructure-jumbotron.svg" alt="Medplum robot coding" width="488" height="384" />
          </div>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Enterprise Observability</h1>
            <p className={styles.heroText}>
              Gain deep insights into systems performance and health. Enables proactive issue detection, efficient
              troubleshooting, and improved system reliability.
            </p>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Datadog"
              title="Observability, site reliability, analytics"
              imgUrl="/img/blog/datadog-logo.jpeg"
              webUrl="/docs/self-hosting/datadog"
            />
            <ProfileCard
              name="Splunk"
              title="Site reliability, analytics"
              imgUrl="/img/blog/splunk-logo.jpg"
              webUrl="/docs/integration#first-party-integrations"
            />
            <ProfileCard
              name="Sumo Logic"
              title="Security, analytics"
              imgUrl="/img/blog/sumologic-logo.jpg"
              webUrl="/docs/integration#first-party-integrations"
            />
          </CardContainer>
          <Jumbotron>
            <div className={styles.heroImage}>
              <img src="/img/infrastructure-jumbotron.svg" alt="Medplum robot coding" width="488" height="384" />
            </div>
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>Enterprise Integrations</h1>
              <p className={styles.heroText}>
                Enable reliable, compliant and auditable connectivity to service providers and partners.
              </p>
            </div>
          </Jumbotron>
          <CardContainer>
            <ProfileCard
              name="Labcorp"
              title="Diagnostics, integrations, workflow"
              imgUrl="/img/blog/labcorp-logo.png"
              webUrl="/docs/integration#first-party-integrations"
            />
            <ProfileCard
              name="Quest Diagnostics"
              title="Diagnostics, integrations, workflow"
              imgUrl="/img/blog/quest-logo.jpeg"
              webUrl="/docs/integration#first-party-integrations"
            />
            <ProfileCard
              name="Health Gorilla"
              title="Lab, integrations, workflow"
              imgUrl="/img/blog/health-gorilla-logo.png"
              webUrl="/docs/integration/health-gorilla"
              youtubeUrl="https://youtu.be/m0AWpEOh1es"
            />
          </CardContainer>
          <CardContainer>
            <ProfileCard
              name="Epic Systems"
              title="Legacy EHR, workflow"
              imgUrl="/img/blog/epic-logo.png"
              webUrl="/docs/integration#first-party-integrations"
              youtubeUrl="https://youtu.be/E8VD9rgadG0"
            />
            <ProfileCard
              name="Candid Health"
              title="Billing, workflow"
              imgUrl="/img/blog/candid-health-logo.jpeg"
              webUrl="/docs/integration#first-party-integrations"
            />
            <ProfileCard
              name="Open AI"
              title="AI, workflow"
              imgUrl="/img/blog/open-ai-logo.png"
              webUrl="/docs/integration#first-party-integrations"
            />
          </CardContainer>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Onboarding Workshop</h1>
            <p className={styles.heroText}>
              Medplum Enterprise includes a two week workship with team training, integrations planning, documentation
              and setup. The materials are customized to the specific needs of your implementation.
            </p>
            <a href="https://cal.com/medplum/demo" className={styles.getStartedButton}>
              <div>Book Now</div>
              <img src="/img/btn-arrow.svg" alt="Go arrow" width="32" height="32" />
            </a>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/blog/workshop.svg" alt="Medplum robot coding" width="488" height="384" />
          </div>
        </Jumbotron>
      </Container>
    </Layout>
  );
}
