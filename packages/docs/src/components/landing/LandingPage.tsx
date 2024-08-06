import Layout from '@theme/Layout';
import { useEffect } from 'react';
import { Card } from '../Card';
import { CardButton } from '../CardButton';
import { CardContainer } from '../CardContainer';
import { Container } from '../Container';
import { AnimatedCircle } from './AnimatedCircle';
import { AnimatedInfinity } from './AnimatedInfinity';
import { Feature, FeatureGrid } from './FeatureGrid';
import { HeroSection } from './HeroSection';
import { Jumbotron } from './Jumbotron';
import styles from './LandingPage.module.css';
import { LogoScroller } from './LogoScroller';
import { Section } from './Section';
import { SectionHeader } from './SectionHeader';
import { TestimonialHeader } from './TestimonialHeader';

export function LandingPage(): JSX.Element {
  useEffect(() => {
    const navbar = document.querySelector('.navbar') as HTMLDivElement;
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
      <Layout
        title="Medplum"
        description="Medplum is the open source healthcare developer platform that helps you build, test, and deliver any healthcare product or service."
      >
        <HeroSection />
        <Container>
          <Section>
            <CardContainer>
              <Card>
                <div className={styles.cardImage}>
                  <AnimatedCircle value={200} suffix="k" />
                </div>
                <h3>Dev hours saved annually</h3>
                <p>
                  No more choosing between prepackaged EHRs or spending thousands of dev hours on homegrown solutions.
                  Medplum moves the starting line so you can get to the unique features of your app, stat.
                </p>
              </Card>
              <Card>
                <div className={styles.cardImage}>
                  <AnimatedInfinity />
                </div>
                <h3>Infinitely programmable, forever</h3>
                <p>
                  Medplum enables any application, any automation, any integration you can imagine, and lets you
                  seamlessly operate in the wider healthcare ecosystem of today, tomorrow, and every day after.
                </p>
              </Card>
              <Card>
                <div className={styles.cardImage}>
                  <AnimatedCircle value={90} />
                </div>
                <h3>Elite healthcare dev contributors</h3>
                <p>
                  Our robust universe of documentation, community, and support keeps you in the company of today's best
                  healthcare developers.
                </p>
              </Card>
            </CardContainer>
          </Section>
          <Section>
            <pre>
              <code>
                git clone https://github.com/medplum/medplum-hello-world.git{'\n'}
                cd medplum-hello-world{'\n'}
                npm i{'\n'}
                npm run dev{'\n'}
              </code>
            </pre>
          </Section>
          <SectionHeader>
            <h2>Focus on building apps, not infra</h2>
            <p>The future-ready, medical-grade backend that tames the complexity of healthcare development.</p>
          </SectionHeader>
          <Section>
            <FeatureGrid columns={3}>
              <Feature title="API-first" imgSrc="/img/icons/api.svg">
                Integrate with any partner, anywhere, in any way with data share options in a variety of formats.
              </Feature>
              <Feature title="FHIR-native" imgSrc="/img/icons/code.svg">
                Anticipate nuances and avoid costly re-writes down the line with default FHIR-standard formatted data
                storage.
              </Feature>
              <Feature title="Automation" imgSrc="/img/icons/automation.svg">
                Streamline your operations and automate any workflow to activate, track, manage, and measure tasks of
                any level of complexity.
              </Feature>
              <Feature title="Open source" imgSrc="/img/icons/locker.svg">
                Medplum's core technology is open source (Apache 2.0 license) and freely available in GitHub, so there’s
                never a risk of vendor lock-in.
              </Feature>
              <Feature title="Secure &amp; Compliant" imgSrc="/img/icons/shield.svg">
                Comes with HIPAA and SOC2 compliance out of the box, follows all OWASP security guidelines, and is
                verified by multiple penetration tests.
              </Feature>
              <Feature title="Scalable" imgSrc="/img/icons/scalable.svg">
                From MVP to IPO - and every major milestone in between - Medplum’s technology backs you up and grows
                with you.
              </Feature>
            </FeatureGrid>
          </Section>
          <SectionHeader>
            <h2>Trusted by</h2>
          </SectionHeader>
          <Section>
            <LogoScroller />
          </Section>
          <SectionHeader>
            <h2>Solutions</h2>
          </SectionHeader>
          <Section>
            <CardContainer>
              <Card>
                <h3>Custom EHR</h3>
                <p>Save hundreds of hours of dev time with our headless EHR.</p>
                <CardButton href="/solutions/custom-ehr" alt="Learn more about Medplum Custom EHR">
                  Learn more
                </CardButton>
              </Card>
              <Card>
                <h3>Patient Portal</h3>
                <p>Accelerate customizable, scalable patient-facing experiences.</p>
                <CardButton href="/solutions/patient-portal" alt="Learn more about Medplum Patient Portal">
                  Learn more
                </CardButton>
              </Card>
              <Card>
                <h3>Provider Portal</h3>
                <p>Accelerate customizable, scalable provider-facing experiences.</p>
                <CardButton href="/solutions/provider-portal" alt="Learn more about Medplum Provider Portal">
                  Learn more
                </CardButton>
              </Card>
            </CardContainer>
          </Section>
          <Jumbotron>
            <div className={styles.heroContent}>
              <h3>Infrastructure you can trust to meet any future you make.</h3>
              <p>
                Infrastructure you can trust to meet whatever future you make. Medplum fast-paths your team to the
                innovation stage, increasing your developer velocity to let you get to market faster with a secure,
                compliant, and scalable foundation. It’s clean, customizable technology that simply works - from MVP to
                IPO.
              </p>
              <a href="https://cal.com/medplum/demo" className={styles.getStartedButton}>
                <div>Book a demo</div>
                <img src="/img/btn-arrow.svg" alt="Go arrow" width="32" height="32" />
              </a>
            </div>
            <div className={styles.heroImage}>
              <img
                src="/img/infrastructure-jumbotron.svg"
                alt="Robot working in a medical office"
                width="400"
                height="400"
              />
            </div>
          </Jumbotron>
          <Section>
            <CardContainer>
              <Card>
                <h2>
                  You can't build for tomorrow
                  <br />
                  on yesterday's tech.
                </h2>
                <p>
                  Medplum is built by and for exceptional engineers at the forefront of digital healthcare. Our vision
                  is to accelerate the development of new healthcare products and services by clearing a path for every
                  developer who wants to build in the healthcare ecosystem.
                </p>
              </Card>
            </CardContainer>
          </Section>
          <Section>
            <CardContainer>
              <Card>
                <h3>Ready to get started?</h3>
                <p>Explore our Docs or create an account to start building now. </p>
                <CardButton href="/docs" alt="Learn more about Medplum">
                  Get started
                </CardButton>
              </Card>
              <Card>
                <h3>Plans and pricing</h3>
                <p>A plan for every project with no hidden fees and an always-free tier.</p>
                <CardButton href="/pricing" alt="Go to Medplum Pricing page">
                  Pricing
                </CardButton>
              </Card>
              <Card>
                <h3>Not a developer?</h3>
                <p>Let’s talk about how Medplum can help your dev team ship faster.</p>
                <CardButton href="mailto:hello@medplum.com" alt="Learn more about FHIR Basics">
                  Email us
                </CardButton>
              </Card>
            </CardContainer>
          </Section>
          <SectionHeader>
            <h2>User Testimonials</h2>
            <p>Join thousands of developers across the world who use Medplum.</p>
          </SectionHeader>
          <Section>
            <CardContainer>
              <Card>
                <TestimonialHeader
                  name="Michael Caves"
                  title="Dir of Product, Thirty Madison"
                  imgSrc="/img/avatars/michael-caves.webp"
                />
                <p>
                  Thanks to the expertise of the Medplum team, we were able to swiftly implement their product and get
                  it up and running seamlessly. Their proactive approach in anticipating and mitigating any issues
                  during our ramp-up was an example of first rate partnership. With their robust product, we've gained
                  the agility to rapidly introduce new features, enabling Thirty Madison to maintain its commitment to
                  putting patients first.
                </p>
              </Card>
              <Card>
                <TestimonialHeader
                  name="Florencia Herra Vega"
                  title="CEO at AlleyCorp Nord"
                  imgSrc="/img/avatars/florencia.webp"
                />
                <p>
                  We have been dreaming of a product that simplifies building custom EHRs and clinical tools for years.
                  Medplum achieves this with an expert team, a fantastic developer experience, and standards compliance.
                </p>
              </Card>
              <Card>
                <TestimonialHeader
                  name="Jose Rodriguez"
                  title="Head of Engineering Summer Health"
                  imgSrc="/img/avatars/jose-rodrigues.webp"
                />
                <p>
                  If you don’t want to reinvent everything, and want standards compliant data and well documented
                  interfaces, Medplum is what you would choose.
                </p>
              </Card>
            </CardContainer>
            <CardContainer>
              <Card>
                <TestimonialHeader
                  name="Craig Collier"
                  title="Senior Software Engineer, Ro"
                  imgSrc="/img/avatars/craig-collier.webp"
                />
                <p>The Medplum GUI is very nice. There’s a lot of depth there.</p>
              </Card>
              <Card>
                <TestimonialHeader name="Hassy Veldstra" title="Artillery" imgSrc="/img/avatars/hassy.webp" />
                <p>
                  Love seeing scalability &amp; performance treated as a first-class feature. Always a sign of a project
                  that takes quality seriously.
                </p>
              </Card>
              <Card>
                <TestimonialHeader
                  name="Phil Fung"
                  title="Co-founder Kit.com, Facebook Engineer #15"
                  imgSrc="/img/avatars/phil-fung.webp"
                  twitter="https://twitter.com/philfung"
                />
                <p>
                  Quality code base, open source and sets your data on the right path with FHIR. No-brainer for those
                  who need to build for healthcare.
                </p>
              </Card>
            </CardContainer>
            <CardContainer>
              <Card>
                <TestimonialHeader
                  name="Joshua Kelly"
                  title="CTO at Flexpa"
                  imgSrc="/img/avatars/joshuakelly.png"
                  twitter="https://twitter.com/jdjkelly"
                />
                <p>
                  Medplum is the best FHIR server implementation. Flexpa uses it to power our API and we wouldn't have
                  nearly as good a product without it.
                </p>
              </Card>
              <Card>
                <TestimonialHeader name="Dima Goncharov" title="CEO Metriport" imgSrc="/img/avatars/dima.webp" />
                <p>Open source will transform healthcare, and Medplum is a prime example.</p>
              </Card>
              <Card>
                <TestimonialHeader name="Alan G" imgSrc="/img/avatars/ag.webp" />
                <p>First off I want to say this is amazing and I love the work you all are doing.</p>
              </Card>
            </CardContainer>
          </Section>
        </Container>
      </Layout>
    </div>
  );
}
