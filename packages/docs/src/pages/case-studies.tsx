import Layout from '@theme/Layout';
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
            <img src="/img/about-jumbotron.svg" alt="Medplum robot coding" width="488" height="384" />
          </div>
        </Jumbotron>
        <SectionHeader>
          <h2>Solutions</h2>
        </SectionHeader>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="AI" imgSrc="/img/icons/code.svg">
              Medplum is a best of breed EHR for integrating AI. Our customers build sophisticated, high-fidelity{' '}
              <a href="/blog/tags/ai">AI driven applications</a> on an open source platform with much attention to
              detail.
            </Feature>
            <Feature title="Specialty EHR" imgSrc="/img/icons/clinical-logic.svg">
              Medplum powers many specialty electronic health record systems and other purpose-built healthcare apps.
              Implmentations include solutions across specialties: <a href="/blog/tags/pediatrics">pediatrics</a>,
              <a href="/blog/tags/radiology">radiology</a>, <a href="/blog/ensage-case-study">geriatrics</a>, cardiac
              care and more.
            </Feature>
            <Feature title="Diagnostics" imgSrc="/img/icons/cog-icon.svg">
              Diagnostics providers need highly programmable system that can manage data securely at scale. Medplum
              provides solutions for <a href="/blog/ro-case-study">laboratory</a>, medical device, imaging,{' '}
              <a href="/blog/codex-and-the-power-of-g10">remote patient monitoring</a> and more.
            </Feature>
            <Feature title="Interop" imgSrc="/img/icons/interoperability.svg">
              Reliable and transparent <a href="/docs/integration">integrations</a> are built on Medplum. Integrate many
              systems on the same unified platform. Medplum's <a href="/docs/bots">bot framework</a> and{' '}
              <a href="/docs/auth">industry standard authentication</a> offering speed up development and ensure that
              integrations really work.
            </Feature>
          </FeatureGrid>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Summer Health</h1>
            <p className={styles.heroText}>
              <a href="blog/summer-case-study">Pediatric care</a> 24 hours a day via SMS. Their custom EHR features
              streamlined charting using AI which enhances the experience for patients and clinicians.
            </p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://www.youtube.com/embed/H2fJVYG8LvQ?si=KIVtT_e-1WE2zzjs"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Ro Diagnostics"
              title="Lab, integrations, workflow"
              imgUrl="/img/blog/ro-logo.png"
              webUrl="/blog/ro-case-study"
              youtubeUrl="https://youtu.be/q-22Y7Ox2jY"
            />
            <ProfileCard
              name="Titan Intake"
              title="AI, scheduling, interop"
              imgUrl="/img/blog/titan-logo.jpeg"
              webUrl="/blog/titan-case-study"
              youtubeUrl="https://youtu.be/sy3YKRFyPII"
            />
            <ProfileCard
              name="Ensage Health"
              title="Geriatrics, Value Based Care"
              imgUrl="/img/blog/ensage.jpeg"
              youtubeUrl="https://youtu.be/GIlmd7OMZ5g"
              webUrl="/blog/ensage-case-study"
            />
          </CardContainer>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Rad AI</h1>
            <p className={styles.heroText}>
              <a href="blog/radai-case-study">Omni Reporting</a> is an AI powered application that saves time and
              reduces burnout - allowing clinicians to speak less, say more.
            </p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://www.youtube.com/embed/N5ZocZhdPZ0"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </Jumbotron>
      </Container>
    </Layout>
  );
}
