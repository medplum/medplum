import Layout from '@theme/Layout';
import { Card } from '../components/Card';
import { CardContainer } from '../components/CardContainer';
import { Container } from '../components/Container';
import { ProfileCard } from '../components/ProfileCard';
import { Feature, FeatureGrid } from '../components/landing/FeatureGrid';
import { Jumbotron } from '../components/landing/Jumbotron';
import { Section } from '../components/landing/Section';
import { SectionHeader } from '../components/landing/SectionHeader';
import styles from './about.module.css';

export default function CaseStudiesPage(): JSX.Element {
  return (
    <Layout title="Case Studies">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Case Studies</h1>
            <p className={styles.heroText}>
              Read the details on Medplum implementations with extensive reference materials, documentation and videos.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/medplum-overview.svg" alt="Medplum architecture diagram" width="488" height="384" />
          </div>
        </Jumbotron>
        <SectionHeader>
          <h2>Solutions</h2>
        </SectionHeader>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="AI" imgSrc="/img/icons/code.svg">
              Medplum is a best of breed EHR for integrating AI. Our customers build sophisticated, high-fidelity AI
              driven applications on an open source platform with much attention to detail.
            </Feature>
            <Feature title="Specialty EHR" imgSrc="/img/icons/clinical-logic.svg">
              Medplum powers many specialty electronic health record systems and other purpose-built healthcare apps.
              Implmentations include solutions across specialties: pediatrics, radiology, geriatrics, cardiac care and
              more.
            </Feature>
            <Feature title="Diagnostics" imgSrc="/img/icons/cog-icon.svg">
              Diagnostics providers need highly programmable system that can manage data securely at scale. Medplum
              provides solutions for laboratory, medical device, imaging, remote patient monitoring and more.
            </Feature>
            <Feature title="Interop" imgSrc="/img/icons/interoperability.svg">
              Reliable and transparent integrations are built on Medplum. Integrate many systems on the same unified
              platform. Medplum's bot framework and industry standard authentication offering speed up development and
              ensure that integrations really work.
            </Feature>
          </FeatureGrid>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Summer Health</h1>
            <p className={styles.heroText}>
              Pediatric care 24 hours a day via SMS. Summer's custom EHR careOS features streamlined charting using AI
              which enhances the experience for patients and clinicians. This application makes extensive use of patient
              messaging workflows and is mobile optimized.
            </p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://youtu.be/H2fJVYG8LvQ"
              title="YouTube video player"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Ro Diagnostics"
              title="Lab, integrations, workflow"
              imgUrl="/img/blog/ro-logo.png"
              linkedInUrl="https://ro.co/"
              githubUrl="https://www.medplum.com/blog/ro-case-study"
            />
            <ProfileCard
              name="Titan Intake"
              title="AI, scheduling, interop"
              imgUrl="/img/blog/titan-logo.jpeg"
              linkedInUrl="https://www.titanintake.com/"
              githubUrl="https://www.medplum.com/blog/titan-case-study"
            />
            <ProfileCard
              name="Ensage Health"
              title="Geriatrics, Value Based Care, custom EHR"
              imgUrl="/img/blog/ensage.jpg"
              linkedInUrl="https://www.ensagehealth.com/"
              githubUrl="https://www.medplum.com/blog/ensage-case-study"
            />
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
