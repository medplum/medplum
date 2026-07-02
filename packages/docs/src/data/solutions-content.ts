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
  /** A short autoplaying UI clip. Takes precedence over screenshotSrc when set. */
  videoSrc?: string;
  screenshotSrc?: string;
  screenshotAlt?: string;
  valueStatement: string;
  quote?: CustomerQuote;
  metrics?: CustomerMetric[];
  caseStudyUrl?: string;
  isPlaceholder?: boolean;
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

export const SOLUTIONS_LOGOS_HEADING = 'Trusted by healthcare leaders and innovators';

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
        logoSrc: '/img/blog/develo.jpeg',
        screenshotSrc: '/img/solutions/develo-screenshot.jpg',
        screenshotAlt: 'Develo pediatric EHR visit orders and diagnoses screen',
        valueStatement:
          'Develo built a full-featured pediatric EHR and CRM on Medplum — scheduling, charting, billing, and family engagement in one FHIR-native system, with AI-assisted documentation designed around how independent pediatric practices actually work.',
        caseStudyUrl: '/blog/develo-case-study',
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
        id: 'placeholder-patient-engagement-1',
        name: 'Consumer health brand',
        valueStatement:
          'Built a patient app covering intake, messaging, and refills — with every interaction landing in the same record their care team works from.',
        quote: {
          text: 'Placeholder quote about launching a patient experience quickly and iterating on it weekly.',
          attribution: 'John Smith',
          title: 'Head of Product',
        },
        isPlaceholder: true,
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
        videoSrc: '/img/solutions/ultralight-clip.mp4',
        screenshotAlt: 'Ultralight AI-native EHR biomarker dashboard with ambient scribing',
        valueStatement:
          'Ultralight is an AI-native EHR built on Medplum, with an ambient scribe and biomarker intelligence woven directly into the chart — turning documentation and longitudinal data into structured, actionable insight at the point of care.',
      },
      {
        id: 'rad-ai',
        name: 'Rad AI',
        logoSrc: '/img/logos/rad-ai.svg',
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
        id: 'placeholder-population-health-1',
        name: 'Screening program operator',
        valueStatement:
          'Runs population-scale screening programs with automated outreach, results routing, and reporting — from one platform.',
        metrics: [{ value: '1M+', label: 'patients under management' }],
        isPlaceholder: true,
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
        id: 'placeholder-clinical-operations-1',
        name: 'Value-based care group',
        valueStatement:
          'Coordinates care managers, providers, and patients through shared queues and care plans — replacing a patchwork of trackers and inboxes.',
        quote: {
          text: 'Placeholder quote about care managers getting time back for patients instead of admin.',
          attribution: 'John Smith',
          title: 'Chief Medical Officer',
        },
        isPlaceholder: true,
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
        id: 'placeholder-rcm-1',
        name: 'Billing platform company',
        valueStatement:
          'Automates charge capture and claims workflows with custom routing and business rules that fit their financial operations.',
        isPlaceholder: true,
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
        id: 'placeholder-payer-solutions-1',
        name: 'Risk-bearing organization',
        valueStatement:
          'Manages member data, utilization review, and provider collaboration on one platform — with interoperability built in rather than bolted on.',
        isPlaceholder: true,
      },
    ],
  },
];
