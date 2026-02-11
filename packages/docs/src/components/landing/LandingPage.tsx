// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IconApps,
  IconBrandOpenSource,
  IconBuildingBank,
  IconChartBarPopular,
  IconCode,
  IconFlame,
  IconPills,
  IconPlugConnected,
  IconReplace,
  IconSettings,
  IconShieldCheck,
  IconTestPipe,
} from '@tabler/icons-react';
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { Card } from '../Card';
import { BuildDropdown } from './BuildDropdown';
import { Feature, FeatureGrid } from './FeatureGrid';
import styles from './LandingPage.module.css';
import { LogoScroller } from './LogoScroller';
import { Section } from './Section';
import { SectionHeader } from './SectionHeader';
import { SolutionAccordion } from './SolutionAccordion';
import { StatsBento } from './StatsBento';
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
      <Layout>
        <div className={styles.landingContent}>
          <div className={styles.heroSection}>
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>Build and run modern healthcare apps</h1>
              <p className={styles.heroText}>
                Medplum is the open source developer platform for shipping clinical software.<br></br>Start with our
                production-ready apps, then customize them to fit your needs.
              </p>
              <div className={styles.heroButtons}>
                <button
                  type="button"
                  className={styles.purpleButton}
                  onClick={() => (window.location.href = '/docs/provider')}
                >
                  Explore the Provider App
                </button>
                <BuildDropdown />
              </div>
            </div>
            <img
              className={styles.heroImage}
              src="/img/provider/medplum-provider-app-cover-image.webp"
              alt="Medplum Provider App screenshot"
            />
          </div>
          <SectionHeader style={{ marginBottom: '0', marginTop: '0' }}>
            <h3>Trusted by Healthcare Leaders & Innovators</h3>
          </SectionHeader>
          <LogoScroller />
          <SectionHeader>
            <h2>A platform built for healthcare complexity</h2>
            <p>
              Build what you need—without rebuilding the foundation. Medplum provides the core primitives required to
              ship and operate healthcare software in production.
            </p>
          </SectionHeader>
          <Section>
            <FeatureGrid columns={3} variant="ecosystem">
              <Feature title="API-first" icon={<IconCode />}>
                Integrate with any partner, anywhere, in any way with data share options in a variety of formats.
              </Feature>
              <Feature title="FHIR-native" icon={<IconFlame />}>
                Anticipate nuances and avoid costly re-writes down the line with default FHIR-standard formatted data
                storage.
              </Feature>
              <Feature title="Automation-ready" icon={<IconSettings />}>
                Streamline your operations and automate any workflow to activate, track, manage, and measure tasks of
                any level of complexity.
              </Feature>
              <Feature title="Open Source" icon={<IconBrandOpenSource />}>
                Medplum's core technology is open source (Apache 2.0 license) and freely available in GitHub, so there’s
                never a risk of vendor lock-in.
              </Feature>
              <Feature title="Secure &amp; Compliant" icon={<IconShieldCheck />}>
                Comes with HIPAA and SOC2 compliance out of the box, follows all OWASP security guidelines, and is
                verified by multiple penetration tests.
              </Feature>
              <Feature title="Scalable" icon={<IconChartBarPopular />}>
                From MVP to IPO—and every major milestone in between—Medplum’s technology backs you up and grows with
                you.
              </Feature>
            </FeatureGrid>
          </Section>
          <SolutionAccordion />
          <SectionHeader>
            <h2>Connect to the healthcare ecosystem</h2>
            <p>
              Medplum connects to common external systems while letting you build custom integrations when you need
              them.
            </p>
          </SectionHeader>
          <Section>
            <FeatureGrid columns={3} variant="complexity">
              <Feature title="Labs" icon={<IconTestPipe />}>
                Orders, results, and workflows that fit real operations.
              </Feature>
              <Feature title="Medications" icon={<IconPills />}>
                Medication workflows and integrations designed for clinical safety.
              </Feature>
              <Feature title="Billing & RCM" icon={<IconBuildingBank />}>
                Integrate financial workflows without duct-taping your system.
              </Feature>
              <Feature title="Health Exchange" icon={<IconReplace />}>
                Support data exchange patterns used in real-world interoperability.
              </Feature>
              <Feature title="Plugins & Modules" icon={<IconPlugConnected />}>
                Extend Medplum with reusable integration components.
              </Feature>
              <Feature title="Third-party Tools" icon={<IconApps />}>
                Connect CRMs, scheduling, imaging, and specialty systems.
              </Feature>
            </FeatureGrid>
          </Section>
          <SectionHeader>
            <h2>Trusted infrastructure, to meet any future you build</h2>
            <p>
              Mepdplum lets your team skip the plumbing and ship what matters, geting you to market faster with a
              secure, compliant, and scalable foundation.
            </p>
          </SectionHeader>
          <Section>
            <StatsBento />
          </Section>
          <SectionHeader>
            <h2>What healthcare builders are saying</h2>
            <p>Founders, directors, and developers on why they build with Medplum.</p>
          </SectionHeader>
          <div className={styles.masonryGrid}>
            <Card>
              <TestimonialHeader
                name="Michael Caves"
                title="Director of Product, Thirty Madison"
                imgSrc="/img/avatars/michael-caves.webp"
              />
              <p>
                Thanks to the expertise of the Medplum team, we were able to swiftly implement their product and get it
                up and running seamlessly. Their proactive approach in anticipating and mitigating any issues during our
                ramp-up was an example of first rate partnership.
              </p>
              <p style={{ paddingTop: '1rem' }}>
                With their robust product, we've gained the agility to rapidly introduce new features, enabling Thirty
                Madison to maintain its commitment to putting patients first.
              </p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Craig Collier"
                title="Senior Software Engineer, Ro"
                imgSrc="/img/avatars/craig-collier.webp"
              />
              <p>The Medplum GUI is very nice. There's a lot of depth there.</p>
            </Card>
            <Card>
              <TestimonialHeader name="Joshua Kelly" title="CTO, Flexpa" imgSrc="/img/avatars/joshuakelly.png" />
              <p>
                Medplum is the best FHIR server implementation. Flexpa uses it to power our API and we wouldn't have
                nearly as good a product without it.
              </p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Florencia Herra Vega"
                title="CEO, AlleyCorp Nord"
                imgSrc="/img/avatars/florencia.webp"
              />
              <p>
                We have been dreaming of a product that simplifies building custom EHRs and clinical tools for years.
                Medplum achieves this with an expert team, a fantastic developer experience, and standards compliance.
              </p>
            </Card>
            <Card>
              <TestimonialHeader name="Hassy Veldstra" title="Artillery" imgSrc="/img/avatars/hassy.webp" />
              <p>
                Love seeing scalability &amp; performance treated as a first-class feature. Always a sign of a project
                that takes quality seriously.
              </p>
            </Card>
            <Card>
              <TestimonialHeader name="Dima Goncharov" title="CEO, Metriport" imgSrc="/img/avatars/dima.webp" />
              <p>Open source will transform healthcare, and Medplum is a prime example.</p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Brendan Keeler"
                title="Health API Guy Newsletter"
                imgSrc="/img/avatars/jose-rodrigues.webp"
              />
              <p>
                I want to say it loudly for everyone to hear: I love Medplum, I love it so much. […] They’re awesome.
              </p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Stuart Parmenter"
                title="Former CTO, One Medical"
                imgSrc="/img/avatars/stuart.png"
              />
              <p>
                I've built healthcare at scale—the hard way. Skip the hidden complexity and start on Medplum's
                infrastructure so you can ship care, not plumbing.
              </p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Phil Fung"
                title="Co-founder, Kit.com ∙ Engineer #15, Facebook "
                imgSrc="/img/avatars/phil-fung.webp"
              />
              <p>
                Quality code base, open source and sets your data on the right path with FHIR. No-brainer for those who
                need to build for healthcare.
              </p>
            </Card>
            <Card>
              <TestimonialHeader
                name="Jose Rodriguez"
                title="Head of Engineering, Summer Health"
                imgSrc="/img/avatars/jose-rodrigues.webp"
              />
              <p>
                If you don't want to reinvent everything, and want standards compliant data and well documented
                interfaces, Medplum is what you would choose.
              </p>
            </Card>
          </div>
        </div>
        <div className={styles.ctaBanner}>
          <div className={`${styles.landingContent} ${styles.ctaBannerInner}`}>
            <h2>Start building with Medplum today</h2>
            <p className={styles.ctaBannerDescription}>
              Join 150+ open source contributors and thousands of developers who choose Medplum to build secure and
              compliant healthcare apps.
            </p>
            <div className={styles.heroButtons}>
              <button type="button" className={styles.ctaWhiteButton} onClick={() => (window.location.href = '/docs')}>
                See Documentation
              </button>
              <button
                type="button"
                className={styles.purpleButton}
                onClick={() => (window.location.href = 'mailto:hello@medplum.com')}
              >
                Book a Demo
              </button>
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}
