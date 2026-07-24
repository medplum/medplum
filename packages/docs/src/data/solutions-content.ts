// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * All copy and customer entries for the /solutions page live here.
 * Swapping a placeholder for a real customer means editing one object below —
 * no component changes required. Optional fields degrade gracefully:
 * a missing quote renders no quote block, a missing screenshot renders a
 * "coming soon" frame, and so on.
 */

export interface CustomerQuote {
  text: string;
  attribution: string;
  title?: string;
  avatarSrc?: string;
}

export interface CustomerMetric {
  value: string;
  label: string;
}

export interface CustomerFeature {
  id: string;
  name: string;
  logoSrc?: string;
  /** True when the logo is a wordmark that already spells the name, so the
   * text name is redundant and should be hidden in favor of the logo. */
  logoHasName?: boolean;
  /** Height multiplier for the header logo, to even out wordmarks whose files
   * are shorter/narrower than their peers. */
  logoScale?: number;
  /** A short autoplaying UI clip. Takes precedence over screenshotSrc when set. */
  videoSrc?: string;
  screenshotSrc?: string;
  screenshotAlt?: string;
  valueStatement: string;
  quote?: CustomerQuote;
  metrics?: CustomerMetric[];
  caseStudyUrl?: string;
  isPlaceholder?: boolean;
  /** Renders a static illustrative mockup component instead of a screenshot/video/empty frame. */
  illustrativeMockup?: boolean;
  /** CTA shown on a placeholder card, e.g. inviting a partner to build the category. */
  placeholderCta?: { label: string; url: string };
}

export interface AcceleratorCallout {
  icon: string;
  text: string;
  linkLabel: string;
  linkUrl: string;
}

export interface SolutionCategory {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  imageSrc?: string;
  learnMoreUrl?: string;
  customers: CustomerFeature[];
  accelerator?: AcceleratorCallout;
}

export const SOLUTIONS_HERO = {
  headline: 'Built on Medplum',
  sub: "From custom EHRs to payer platforms, leading healthcare organizations use Medplum to launch products faster. Explore what they've built — and what you could build next.",
  primaryCta: { label: 'Book a Demo', href: 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a' },
  secondaryCta: { label: 'Read Case Studies', href: '/case-studies' },
};

export const SOLUTIONS_CTA = {
  headline: 'Ready to see what you could build?',
  body: 'Talk to our team about your use case, or dive deeper into the case studies.',
  primaryCta: { label: 'Book a Demo', href: 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a' },
  secondaryCta: { label: 'Contact Us', href: 'mailto:hello@medplum.com' },
};

export const SOLUTIONS_CATEGORIES: SolutionCategory[] = [
  {
    id: 'custom-ehr',
    title: 'Custom EHR',
    tagline: 'A clinical system that fits your care model — not the other way around.',
    description:
      'Teams replace legacy systems or launch new ones with EHRs designed around their own workflows — pediatrics, cardiology, virtual-first care, and beyond. Complete control over the clinical experience, without building the plumbing.',
    icon: 'IconHeartRateMonitor',
    imageSrc: '/img/solutions/custom-ehr.webp',
    learnMoreUrl: '/solutions/custom-ehr',
    customers: [
      {
        id: 'develo',
        name: 'Develo',
        logoSrc: '/img/logos/develo.png',
        logoHasName: true,
        screenshotSrc: '/img/solutions/develo-screenshot.jpg',
        screenshotAlt: 'Develo pediatric EHR visit orders and diagnoses screen',
        valueStatement:
          'Develo built a full-featured pediatric EHR and CRM on Medplum — scheduling, charting, billing, and family engagement in one FHIR-native system, with AI-assisted documentation designed around how independent pediatric practices actually work.',
        caseStudyUrl: '/blog/develo-case-study',
      },
      {
        id: 'everself',
        name: 'Everself',
        logoSrc: '/img/logos/everselflogo.png',
        logoHasName: true,
        logoScale: 1.6,
        screenshotSrc: '/img/solutions/everself-screenshot.png',
        screenshotAlt: 'Everself Orbit EHR patient timeline with integrated communications',
        valueStatement:
          'Everself built Orbit, a custom EHR on Medplum for its outpatient weight-loss programs, unifying scheduling, charting, messaging, labs, and device data across multiple sites into a single patient record — with a triaged inbox that helps a lean care team manage a growing patient panel.',
        quote: {
          text: "With Medplum, it's just a lot more flexible, and we have a big vision for what we want our EHR to look like: integrating all the modern communications, a newsfeed style that shows longitudinal care rather than episodes of care, and a data structure we own that we can integrate more AI into.",
          attribution: 'Petch Jirapinyo',
          title: 'CEO, Everself',
        },
        caseStudyUrl: '/blog/everself-case-study',
      },
    ],
    accelerator: {
      icon: 'IconRocket',
      text: 'Starting from scratch? Medplum Provider is our open-source reference implementation — run it on day one, then customize every screen and workflow.',
      linkLabel: 'Explore Medplum Provider',
      linkUrl: '/docs/provider',
    },
  },
  {
    id: 'patient-engagement',
    title: 'Patient Engagement',
    tagline: 'Patient experiences that feel like modern consumer apps.',
    description:
      'Portals, onboarding, messaging, and scheduling that patients actually use — fully connected to the clinical record behind the scenes, so nothing falls through the cracks.',
    icon: 'IconUserHeart',
    imageSrc: '/img/solutions/patient-engagement.webp',
    learnMoreUrl: '/solutions/patient-portal',
    customers: [
      {
        id: 'summer-health',
        name: 'Summer Health',
        logoSrc: '/img/logos/summer-health.svg',
        logoHasName: true,
        // Summer Health's wordmark is unusually wide (~9.5:1) — its render is
        // width-bound by the logo's max-width cap, not the height, so this
        // needs a much larger scale than a normal-aspect wordmark to actually
        // grow (see the maxWidth scaling in SolutionsCustomerFeature.tsx).
        logoScale: 2.25,
        valueStatement:
          'Summer Health built a custom pediatric EHR and patient portal on Medplum in just 16 weeks, giving parents 24/7 SMS-based access to pediatricians with AI-assisted encounter documentation and full family and caregiver access controls.',
        caseStudyUrl: '/blog/summer-case-study',
      },
      {
        id: 'quilted-health',
        name: 'Quilted Health',
        logoSrc: '/img/logos/quilted-health.png',
        logoHasName: true,
        logoScale: 1.35,
        valueStatement:
          'Quilted Health runs patient engagement for its maternity care centers on Medplum — appointment reminders, in-portal messaging, and SMS notifications that keep patients connected to their care team between visits.',
      },
    ],
  },
  {
    id: 'scribe-agents',
    title: 'Scribe and Agents',
    tagline: 'AI documentation and agents, grounded in real clinical data.',
    description:
      'Ambient scribes and clinical agents whose output lands directly in the chart as structured data — not in a silo. Build AI that reads context, takes action, and stays auditable.',
    icon: 'IconFileTextSpark',
    imageSrc: '/img/solutions/scribe-agents.webp',
    customers: [
      {
        id: 'ultralight',
        name: 'Ultralight',
        logoSrc: '/img/logos/ultralight.svg',
        logoHasName: true,
        videoSrc: '/img/solutions/ultralight-clip.mp4',
        screenshotAlt: 'Ultralight AI-native EHR biomarker dashboard with ambient scribing',
        valueStatement:
          'Ultralight is an AI-native EHR built on Medplum, with an ambient scribe and biomarker intelligence woven directly into the chart — turning documentation and longitudinal data into structured, actionable insight at the point of care.',
      },
      {
        id: 'rad-ai',
        name: 'Rad AI',
        logoSrc: '/img/logos/rad-ai.svg',
        logoHasName: true,
        videoSrc: '/img/solutions/rad-ai-clip.mp4',
        valueStatement:
          'Rad AI builds generative AI trusted by radiologists across thousands of healthcare facilities, using Medplum to ground its models in structured clinical data — automating reporting and follow-up so care teams move faster with less manual work.',
        caseStudyUrl: '/blog/radai-case-study',
      },
    ],
  },
  {
    id: 'population-health',
    title: 'Population Health',
    tagline: 'See and manage outcomes across entire populations.',
    description:
      'Registries, screening programs, and analytics that help organizations track cohorts, close care gaps, and report with confidence — on data that stays current as care happens.',
    icon: 'IconChartHistogram',
    imageSrc: '/img/solutions/population-health.webp',
    customers: [
      {
        id: 'color',
        name: 'Color',
        logoSrc: '/img/logos/color.svg',
        logoHasName: true,
        valueStatement:
          "Color built its Virtual Cancer Clinic on Medplum, screening and managing hundreds of thousands of covered lives for employers and health plans, with automated care pathways that schedule each patient's next screening as soon as the prior one is complete.",
      },
      {
        id: 'vanna',
        name: 'Vanna',
        logoSrc: '/img/logos/vanna.svg',
        logoHasName: true,
        valueStatement:
          'Vanna delivers value-based care to a population living with serious mental illness, using Medplum to power care coordination between community coaches and members, detect gaps in care, and track outcomes by cohort under payer value-based contracts.',
      },
    ],
  },
  {
    id: 'clinical-operations',
    title: 'Clinical Operations',
    tagline: 'Care team coordination without the swivel chair.',
    description:
      'Task management, scheduling, and care plans that keep clinical teams aligned — one queue, one record, no duplicate data entry across disconnected tools.',
    icon: 'IconFirstAidKit',
    imageSrc: '/img/solutions/care-management.webp',
    customers: [
      {
        id: 'imagine-pediatrics',
        name: 'Imagine Pediatrics',
        logoSrc: '/img/logos/imagine.svg',
        logoHasName: true,
        logoScale: 2.2,
        valueStatement:
          'Imagine Pediatrics runs multidisciplinary care coordination for medically complex children on Medplum, using structured intake and clinical documentation across a rapidly growing patient population.',
      },
      {
        id: 'tia',
        name: 'Tia',
        logoSrc: '/img/logos/tia.svg',
        logoHasName: true,
        valueStatement:
          "Tia runs its own network of multi-disciplinary clinics — primary care, gynecology, mental health, and metabolic and skin health — on a custom EHR it's building on Medplum, unifying its care teams' documentation and prescribing workflows on a single platform.",
      },
    ],
  },
  {
    id: 'rcm',
    title: 'RCM',
    tagline: "Billing that's connected to care from day one.",
    description:
      'Charge capture, claims, and payments built on the same record as the clinical work — so revenue operations stop chasing missing data and start closing the loop.',
    icon: 'IconReceiptDollar',
    imageSrc: '/img/solutions/rcm.webp',
    customers: [
      {
        id: 'pictionhealth',
        name: 'Pictionhealth',
        logoSrc: '/img/logos/pictionhealth.png',
        logoHasName: true,
        logoScale: 1.35,
        valueStatement:
          'Pictionhealth built a teledermatology EHR on Medplum that runs its full care model — asynchronous dermatology review through nurse-practitioner visits — with automated claims submission through a live Candid Health integration and lab ordering through Health Gorilla.',
      },
    ],
  },
  {
    id: 'payer-solutions',
    title: 'Payer Solutions',
    tagline: 'Modern infrastructure for plans and risk-bearing organizations.',
    description:
      'Utilization management, member data, and provider collaboration on a platform built for interoperability from the start — ready for the standards payers are required to meet.',
    icon: 'IconBuildingBank',
    customers: [
      {
        id: 'payer-solutions-illustrative',
        name: 'Illustrative example',
        illustrativeMockup: true,
        valueStatement:
          "No customer has built this yet — here's what a payer solution on Medplum could look like: utilization management, member eligibility, and provider data management, all on FHIR from day one.",
        isPlaceholder: true,
        placeholderCta: { label: 'Partner with us to build this', url: 'mailto:hello@medplum.com' },
      },
    ],
  },
];
