import { Container } from '../Container';
import { Jumbotron } from './Jumbotron';
import styles from './LandingPage.module.css';

export function HeroSection(): JSX.Element {
  return (
    <div className={styles.heroSection}>
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Fast and easy
              <br />
              healthcare dev
            </h1>
            <p className={styles.heroText}>
              Medplum is the open source healthcare developer platform that helps you build, test, and deliver any
              healthcare product or service.
            </p>
            <a href="/docs" className={styles.getStartedButton}>
              <div>Get Started</div>
              <img src="/img/btn-arrow.svg" alt="Go arrow" width="32" height="32" />
            </a>
          </div>
          <div className={styles.heroImage}>
            <img src="/img/illustration-header.svg" alt="Robot working in a medical office" width="450" height="450" />
          </div>
        </Jumbotron>
      </Container>
    </div>
  );
}
