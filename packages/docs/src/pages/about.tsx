import Layout from '@theme/Layout';
import React from 'react';
import { CardContainer } from '../components/CardContainer';
import { Section } from '../components/landing/Section';
import styles from './about.module.css';
import { Container } from '../components/Container';

export default function AboutPage(): JSX.Element {
  return (
    <Layout title="About us">
      <Container>
        <div className={styles.title}>
          <h1>Trusted Experts</h1>
        </div>
        <Section>
          <CardContainer>
            <div className={styles.profileCard}>
              <div className={styles.profileImage}>
                <img src="/img/people/reshma.jpg" alt="Reshma Khilnani profile picture" />
              </div>
              <h3>Reshma Khilnani</h3>
              <p>CEO</p>
              <a href="https://www.linkedin.com/in/reshmakhilnani/" target="_blank" className={styles.profileLink}>
                <img src="/img/linkedin-purple.svg" loading="lazy" alt="LinkedIn Logo" />
                <div>Linkedin</div>
              </a>
            </div>
            <div className={styles.profileCard}>
              <div className={styles.profileImage}>
                <img src="/img/people/cody.jpg" alt="Cody Ebberson profile picture" />
              </div>
              <h3>Cody Ebberson</h3>
              <p>CTO</p>
              <a href="https://www.linkedin.com/in/codyebberson/" target="_blank" className={styles.profileLink}>
                <img src="/img/linkedin-purple.svg" loading="lazy" alt="LinkedIn Logo" />
                <div>Linkedin</div>
              </a>
            </div>
            <div className={styles.profileCard}>
              <div className={styles.profileImage}>
                <img src="/img/people/rahul.jpg" alt="Rahul Agarwal profile picture" />
              </div>
              <h3>Rahul Agarwal</h3>
              <p>COO</p>
              <a
                href="https://www.linkedin.com/in/rahul-agarwal-330a979/"
                target="_blank"
                className={styles.profileLink}
              >
                <img src="/img/linkedin-purple.svg" loading="lazy" alt="LinkedIn Logo" />
                <div>Linkedin</div>
              </a>
            </div>
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
