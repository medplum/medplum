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

export default function AboutPage(): JSX.Element {
  return (
    <Layout title="About us">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>About Medplum</h1>
            <p className={styles.heroText}>
              Our vision is to accelerate the development of new healthcare products and services by clearing a path for
              every developer who wants to build in the healthcare ecosystem.
            </p>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/about-jumbotron.svg" alt="Robot working in a medical office" width="488" height="384" />
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <Card>
              <h3>So that’s what we built.</h3>
              <p>
                We believe that a clean, secure, and compliant data infrastructure layer will elevate the entire field
                of healthcare innovation and make it possible for the top technical talent to focus on what’s next. We
                believe that interoperability is vital to the future of healthcare technology. And we believe that
                starting with a future-ready foundation will propel every healthcare innovator closer to better
                clinical, operational, and financial outcomes.
              </p>
            </Card>
          </CardContainer>
        </Section>
        <SectionHeader>
          <h2>Our values</h2>
        </SectionHeader>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="Act. Deliberately and purposefully." imgSrc="/img/icons/api.svg">
              We move decisively but with intention, seeking to understand the nature of actions before we take them and
              going slow enough to move forward with speed.
            </Feature>
            <Feature title="Practice uncompromising consistency." imgSrc="/img/icons/code.svg">
              We’re reliably steadfast, exhibiting resolute determination and relentless follow-through. We aspire to be
              taken for granted.
            </Feature>
            <Feature title="Convene a catalytic force." imgSrc="/img/icons/automation.svg">
              We believe collaborative innovation will unlock capabilities, advancements, and ideas that will ultimately
              transform healthcare, so we continually strive to elevate and unify the entire field of players.
            </Feature>
            <Feature title="Pursue technical excellence." imgSrc="/img/icons/shield.svg">
              We are fueled by solving hard problems, both technical and human, and are deeply devoted to pushing the
              boundaries of our craft.
            </Feature>
          </FeatureGrid>
        </Section>
        <SectionHeader>
          <h2>Built by and for engineers</h2>
          <p>
            Our team is deeply committed to open source technology and innovating on behalf of the entire healthcare
            ecosystem.
          </p>
        </SectionHeader>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Reshma Khilnani"
              title="CEO"
              imgUrl="/img/people/reshma.jpg"
              linkedInUrl="https://www.linkedin.com/in/reshmakhilnani/"
              githubUrl="https://github.com/reshmakh"
            />
            <ProfileCard
              name="Cody Ebberson"
              title="CTO"
              imgUrl="/img/people/cody.jpg"
              linkedInUrl="https://www.linkedin.com/in/codyebberson/"
              githubUrl="https://github.com/codyebberson"
            />
            <ProfileCard
              name="Rahul Agarwal"
              title="COO"
              imgUrl="/img/people/rahul.jpg"
              linkedInUrl="https://www.linkedin.com/in/rahul-agarwal-330a979/"
              githubUrl="https://github.com/rahul1"
            />
          </CardContainer>
          <CardContainer>
            <ProfileCard
              name="Matt Willer"
              title="Founding Engineer"
              imgUrl="/img/people/mattwiller.jpg"
              linkedInUrl="https://www.linkedin.com/in/matt-willer-0b779463/"
              githubUrl="https://github.com/mattwiller"
            />
            <ProfileCard
              name="Derrick Farris"
              title="Founding Engineer"
              imgUrl="/img/people/derrickfarris.jpg"
              linkedInUrl="https://www.linkedin.com/in/derrickfarris/"
              githubUrl="https://github.com/ThatOneBro"
            />
            <ProfileCard
              name="Matt Long"
              title="Founding Engineer"
              imgUrl="/img/people/mattlong.jpg"
              linkedInUrl="https://www.linkedin.com/in/mateolargo/"
              githubUrl="https://github.com/mattlong"
            />
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
