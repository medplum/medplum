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
              See detailed Medplum implementations with extensive reference materials and videos.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/medplum-overview.svg" alt="Medplum architecture diagram" width="488" height="384" />
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <Card>
              <h3>Real implementations.</h3>
              <p>
                Medplum enables many use cases and scenarios. Find samples and see experiences built by our customers
                across sectors. Examples built by devs, not by marketers.
              </p>
            </Card>
          </CardContainer>
        </Section>
        <SectionHeader>
          <h2>Use Cases</h2>
        </SectionHeader>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="AI." imgSrc="/img/icons/api.svg">
              Sophisticated, high-fidelity uses of AI in healthcare.
            </Feature>
            <Feature title="Specialty EHR." imgSrc="/img/icons/code.svg">
              Pediatrics, geriatrics, cardiac care and more.
            </Feature>
            <Feature title="Automation." imgSrc="/img/icons/automation.svg">
              We believe collaborative innovation will unlock capabilities, advancements, and ideas that will ultimately
              transform healthcare, so we continually strive to elevate and unify the entire field of players.
            </Feature>
            <Feature title="Interop." imgSrc="/img/icons/shield.svg">
              Reliable and transparent integration. Integrate many systems on the same unified platform.
            </Feature>
          </FeatureGrid>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Summer Health</h1>
            <p className={styles.heroText}>Pediatric care via SMS, streamlined charting using AI.</p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://www.youtube.com/embed/sy3YKRFyPII?start=0"
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
              imgUrl="/img/logos/ro.webp"
              linkedInUrl="https://www.linkedin.com/in/reshmakhilnani/"
              githubUrl="https://github.com/reshmakh"
            />
            <ProfileCard
              name="Titan Intake"
              title="AI, Patient intake, scheduling"
              imgUrl="/img/people/cody.jpg"
              linkedInUrl="https://www.medplum.com/blog/titan-case-study"
              githubUrl="https://www.titanintake.com/"
            />
            <ProfileCard
              name="Ensage Health"
              title="Geriatrics, Value Based Care"
              imgUrl="/img/people/rahul.jpg"
              linkedInUrl="https://www.medplum.com/blog/ensage-case-study"
              githubUrl="https://www.ensagehealth.com/"
            />
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
