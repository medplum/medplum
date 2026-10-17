// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type PlanId = 'free' | 'production' | 'premium' | 'enterprise';

export interface Entitlement {
  readonly text: string;
}

export interface ComparisonRow {
  readonly label: string;
  readonly description?: string;
  readonly docsHref?: string;
  readonly values: Record<PlanId, Entitlement>;
}

export interface ComparisonGroup {
  readonly title: string;
  readonly rows: readonly ComparisonRow[];
}

export const salesUrl = 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a';
const productionCheckoutUrl = 'https://buy.stripe.com/bIY16F88LgtKfDO146';

const value = (text: string): Entitlement => ({ text });
const unavailable = value('Not Included');
const included = value('Included');
const hostingRows: readonly ComparisonRow[] = [
  {
    label: 'Deployment',
    docsHref: '/docs/self-hosting/considerations',
    values: {
      free: value('Medplum-hosted'),
      production: value('Medplum-hosted'),
      premium: value('Medplum-hosted'),
      enterprise: value('Hosted or self-hosted'),
    },
  },
  {
    label: 'Production and Staging Environments',
    description: 'Included with paid hosted plans. Self-hosted environments are customer-managed.',
    values: { free: unavailable, production: included, premium: included, enterprise: included },
  },
  {
    label: 'Custom Domains',
    values: { free: unavailable, production: value('1'), premium: value('5'), enterprise: value('10') },
  },
];

const platformRows: readonly ComparisonRow[] = [
  {
    label: 'Bots',
    docsHref: '/docs/bots',
    description: 'Run custom code to automate workflows and connect external systems.',
    values: { free: unavailable, production: included, premium: included, enterprise: included },
  },
  {
    label: 'Scheduled Bots',
    docsHref: '/docs/bots/bot-cron-job',
    description: 'Run Bots on a recurring schedule.',
    values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
  },
  {
    label: 'Async Batch',
    docsHref: '/docs/fhir-datastore/processing-async-bundles',
    description: 'Process FHIR batches in the background.',
    values: { free: unavailable, production: included, premium: included, enterprise: included },
  },
  {
    label: 'Concurrent WebSocket Connections',
    docsHref: '/docs/react/use-subscription',
    description: 'Simultaneous connections that receive real-time updates when resources change.',
    values: { free: unavailable, production: unavailable, premium: value('2,000'), enterprise: value('5,000') },
  },
];

const integrationRows: readonly ComparisonRow[] = [
  {
    label: 'e-Prescribing',
    docsHref: '/docs/integration/dosespot',
    description: 'Electronic prescribing. Additional usage is billed separately.',
    values: {
      free: unavailable,
      production: unavailable,
      premium: value('Included Allowance'),
      enterprise: value('Larger Included Allowance'),
    },
  },
  {
    label: 'Labs',
    docsHref: '/docs/integration/health-gorilla',
    description: 'Lab ordering and results. Additional usage is billed separately.',
    values: {
      free: unavailable,
      production: unavailable,
      premium: value('Included Allowance'),
      enterprise: value('Larger Included Allowance'),
    },
  },
  {
    label: 'Health Information Exchange (HIE)',
    docsHref: '/docs/integration/health-gorilla',
    description: 'Exchange patient records. Additional usage is billed separately.',
    values: {
      free: unavailable,
      production: unavailable,
      premium: value('Included Allowance'),
      enterprise: value('Larger Included Allowance'),
    },
  },
  {
    label: 'Fax',
    docsHref: '/docs/integration/efax',
    description: 'Send and receive faxes. Usage is billed separately.',
    values: {
      free: unavailable,
      production: unavailable,
      premium: value('Available; Usage Fees Apply'),
      enterprise: value('Available; Usage Fees Apply'),
    },
  },
  {
    label: 'Clearinghouse',
    docsHref: '/docs/integration',
    description: 'Claims and eligibility. Usage is billed separately.',
    values: {
      free: unavailable,
      production: unavailable,
      premium: value('Available; Usage Fees Apply'),
      enterprise: value('Available; Usage Fees Apply'),
    },
  },
  {
    label: 'HL7 Connectivity (Medplum Agent)',
    docsHref: '/docs/agent',
    description: 'Connect to HL7-enabled healthcare systems through Medplum Agent.',
    values: {
      free: unavailable,
      production: value('Paid Add-On'),
      premium: value('Paid Add-On'),
      enterprise: value('Paid Add-On'),
    },
  },
  {
    label: 'Data Warehouse Connector (Beta)',
    docsHref: '/docs/analytics/redshift',
    description: 'Sync FHIR resources on a schedule for analytics in Snowflake, Amazon Redshift, and other engines.',
    values: {
      free: unavailable,
      production: value('Paid Add-On'),
      premium: value('Paid Add-On'),
      enterprise: value('Paid Add-On'),
    },
  },
];

const terminologyRows: readonly ComparisonRow[] = [
  {
    label: 'Terminology Validation',
    docsHref: '/docs/api/fhir/operations/valueset-validate-code',
    values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
  },
  {
    label: 'Managed Terminology (UMLS)',
    description: 'Medplum-hosted service. Self-hosted deployments require customer-provided terminology licenses.',
    values: { free: unavailable, production: unavailable, premium: included, enterprise: value('Hosted only') },
  },
];

export const groups: readonly ComparisonGroup[] = [
  { title: 'Hosting and Environments', rows: hostingRows },
  { title: 'Platform Features', rows: platformRows },
  { title: 'Integrations', rows: integrationRows },
  { title: 'Terminology', rows: terminologyRows },
  {
    title: 'Security and Observability',
    rows: [
      {
        label: 'Access Policies',
        docsHref: '/docs/access/access-policies',
        description: 'Control read and write access to resources and fields.',
        values: {
          free: value('Testing only'),
          production: value('3'),
          premium: value('10'),
          enterprise: value('20'),
        },
      },
      {
        label: 'Google Authentication',
        docsHref: '/docs/auth/google-auth',
        values: { free: included, production: included, premium: included, enterprise: included },
      },
      {
        label: 'Required Google Authentication',
        description: 'Require users on your domain to sign in through Google.',
        values: { free: unavailable, production: included, premium: included, enterprise: included },
      },
      {
        label: 'WAF Protection',
        description: 'For Medplum-hosted deployments. Self-hosted infrastructure is customer-managed.',
        values: { free: included, production: included, premium: included, enterprise: included },
      },
      {
        label: 'IP Address Restrictions',
        docsHref: '/docs/access/ip-access-rules',
        values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
      },
      {
        label: 'SCIM Administration',
        docsHref: '/docs/api/scim/overview',
        values: { free: unavailable, production: unavailable, premium: unavailable, enterprise: included },
      },
      {
        label: 'External Log Streaming',
        docsHref: '/docs/integration/log-streaming',
        values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
      },
    ],
  },
  {
    title: 'Compliance and Agreements',
    rows: [
      {
        label: 'ONC-Certified EHR',
        docsHref: '/docs/compliance/onc',
        description: 'Available under your Medplum agreement.',
        values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
      },
      {
        label: 'ONC Certification Guidance',
        description: 'Guidance on certification paths for custom applications and self-hosted deployments.',
        values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
      },
      {
        label: 'Security Incident Response',
        description: 'Incident response assistance, scoped separately from the availability SLA.',
        values: {
          free: unavailable,
          production: value('Paid Add-On'),
          premium: value('Paid Add-On'),
          enterprise: value('Paid Add-On'),
        },
      },
      {
        label: 'Audit Support',
        description: 'Support during audits required by health system and payer partnerships.',
        values: { free: unavailable, production: unavailable, premium: unavailable, enterprise: included },
      },
      {
        label: 'Standard MSA',
        values: { free: unavailable, production: included, premium: included, enterprise: included },
      },
      {
        label: 'Standard BAA',
        values: {
          free: unavailable,
          production: included,
          premium: included,
          enterprise: value('Included for hosted'),
        },
      },
    ],
  },
  {
    title: 'Support',
    rows: [
      {
        label: 'Assigned Forward-Deployed Engineer',
        description: 'Technical advice, architecture guidance, and examples.',
        values: { free: unavailable, production: unavailable, premium: included, enterprise: included },
      },
      {
        label: 'Assigned Deployment Strategist',
        description: 'Product and workflow design, implementation strategy, and stakeholder alignment.',
        values: { free: unavailable, production: unavailable, premium: unavailable, enterprise: included },
      },
      {
        label: 'Support Channels',
        values: {
          free: value('Discord and GitHub'),
          production: value('Discord and GitHub'),
          premium: value('Private Slack and email'),
          enterprise: value('Agreed support channels'),
        },
      },
      {
        label: 'Hosted Availability SLA',
        description: 'Does not apply to customer-operated infrastructure.',
        values: {
          free: unavailable,
          production: unavailable,
          premium: value('Per agreement'),
          enterprise: value('Per agreement'),
        },
      },
      {
        label: 'Shared Roadmap',
        values: { free: unavailable, production: unavailable, premium: unavailable, enterprise: included },
      },
    ],
  },
];

export const plans: readonly {
  id: PlanId;
  name: string;
  audience: string;
  details?: { label: string; href: string };
  price?: string;
  startingPrice?: boolean;
  period?: string;
  cta: string;
  href: string;
}[] = [
  {
    id: 'free',
    name: 'Free',
    audience: 'For prototyping and learning.',
    details: { label: 'Why Open Source', href: '/open-source' },
    price: '$0',
    period: '/month',
    cta: 'Sign Up',
    href: 'https://app.medplum.com/register',
  },
  {
    id: 'production',
    name: 'Production',
    audience: 'For small-scale production applications, including patient care and research.',
    price: '$2,000',
    startingPrice: true,
    period: '/month',
    cta: 'Sign Up',
    href: productionCheckoutUrl,
  },
  {
    id: 'premium',
    name: 'Premium',
    audience: 'For production applications that need integrations and dedicated technical support.',
    price: '$6,000',
    startingPrice: true,
    period: '/month',
    cta: 'Sign Up',
    href: 'https://buy.stripe.com/6oEbLj9cPb9q63e4gk',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'For organizations with complex workflow, integration, or hosting requirements.',
    cta: 'Contact Us',
    href: salesUrl,
  },
];
