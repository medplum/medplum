// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type PlanId = 'free' | 'production' | 'premium' | 'enterprise';

export type Entitlement =
  boolean | string | { readonly text: string; readonly link: { readonly text: string; readonly href: string } };

export interface ComparisonRow {
  readonly label: string;
  readonly description?: string;
  readonly docsHref?: string;
  readonly values: Record<PlanId, Entitlement>;
}

export interface ComparisonGroup {
  readonly title: string;
  readonly rows: readonly ComparisonRow[];
  readonly note?: {
    readonly prefix: string;
    readonly link: { readonly text: string; readonly href: string };
    readonly suffix: string;
  };
}

export const salesUrl = 'https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a';

const hostingRows: readonly ComparisonRow[] = [
  {
    label: 'Deployment',
    values: {
      free: 'Medplum-hosted',
      production: 'Medplum-hosted',
      premium: 'Medplum-hosted',
      enterprise: { text: 'Hosted or', link: { text: 'self-hosted', href: '/docs/self-hosting/considerations' } },
    },
  },
  {
    label: 'Production and Staging Environments',
    description: 'Included with paid hosted plans. Self-hosted environments are customer-managed.',
    values: { free: false, production: true, premium: true, enterprise: true },
  },
  {
    label: 'Custom Domains',
    values: { free: false, production: '1', premium: '5', enterprise: '10' },
  },
];

const platformRows: readonly ComparisonRow[] = [
  {
    label: 'Bots',
    docsHref: '/docs/bots',
    description: 'Run custom code to automate workflows and connect external systems.',
    values: { free: false, production: true, premium: true, enterprise: true },
  },
  {
    label: 'Scheduled Bots',
    docsHref: '/docs/bots/bot-cron-job',
    description: 'Run Bots on a recurring schedule.',
    values: { free: false, production: false, premium: true, enterprise: true },
  },
  {
    label: 'Async Batch',
    docsHref: '/docs/fhir-datastore/processing-async-bundles',
    description: 'Process FHIR batches in the background.',
    values: { free: false, production: true, premium: true, enterprise: true },
  },
  {
    label: 'Concurrent WebSocket Connections',
    docsHref: '/docs/react/use-subscription',
    description: 'Simultaneous connections that receive real-time updates when resources change.',
    values: { free: false, production: false, premium: '2,000', enterprise: '5,000' },
  },
];

const integrationRows: readonly ComparisonRow[] = [
  {
    label: 'e-Prescribing',
    docsHref: '/docs/decision-guides/e-prescribe#related-integrations',
    description: 'Electronic prescribing. Additional usage is billed separately.',
    values: {
      free: false,
      production: false,
      premium: 'Included Allowance',
      enterprise: 'Larger Included Allowance',
    },
  },
  {
    label: 'Labs',
    docsHref: '/docs/integration/health-gorilla',
    description: 'Lab ordering and results. Additional usage is billed separately.',
    values: {
      free: false,
      production: false,
      premium: 'Included Allowance',
      enterprise: 'Larger Included Allowance',
    },
  },
  {
    label: 'Health Information Exchange (HIE)',
    description: 'Exchange patient records. Additional usage is billed separately.',
    values: {
      free: false,
      production: false,
      premium: 'Included Allowance',
      enterprise: 'Larger Included Allowance',
    },
  },
  {
    label: 'Fax',
    docsHref: '/docs/integration/efax',
    description: 'Send and receive faxes. Usage is billed separately.',
    values: {
      free: false,
      production: false,
      premium: 'Available; Usage Fees Apply',
      enterprise: 'Available; Usage Fees Apply',
    },
  },
  {
    label: 'Clearinghouse',
    docsHref: '/docs/integration/stedi',
    description: 'Claims and eligibility. Usage is billed separately.',
    values: {
      free: false,
      production: false,
      premium: 'Available; Usage Fees Apply',
      enterprise: 'Available; Usage Fees Apply',
    },
  },
  {
    label: 'HL7 Connectivity (Medplum Agent)',
    docsHref: '/docs/agent',
    description: 'Connect to HL7-enabled healthcare systems through Medplum Agent.',
    values: {
      free: false,
      production: 'Paid Add-On',
      premium: 'Paid Add-On',
      enterprise: 'Paid Add-On',
    },
  },
  {
    label: 'Data Warehouse Connector',
    docsHref: '/docs/analytics/snowflake',
    description: 'Sync FHIR resources on a schedule for analytics in Snowflake, Amazon Redshift, and other engines.',
    values: {
      free: false,
      production: 'Paid Add-On',
      premium: 'Paid Add-On',
      enterprise: 'Paid Add-On',
    },
  },
];

const terminologyRows: readonly ComparisonRow[] = [
  {
    label: 'Terminology Validation',
    docsHref: '/docs/api/fhir/operations/valueset-validate-code',
    values: { free: false, production: false, premium: true, enterprise: true },
  },
  {
    label: 'Managed Terminology (UMLS)',
    description: 'Medplum-hosted service. Self-hosted deployments require customer-provided terminology licenses.',
    values: { free: false, production: false, premium: true, enterprise: 'Hosted only' },
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
          free: 'Testing only',
          production: '3',
          premium: '10',
          enterprise: '20',
        },
      },
      {
        label: 'Google Authentication',
        docsHref: '/docs/auth/google-auth',
        values: { free: true, production: true, premium: true, enterprise: true },
      },
      {
        label: 'Required Google Authentication',
        description: 'Require users on your domain to sign in through Google.',
        values: { free: false, production: true, premium: true, enterprise: true },
      },
      {
        label: 'WAF Protection',
        description: 'For Medplum-hosted deployments. Self-hosted infrastructure is customer-managed.',
        values: { free: true, production: true, premium: true, enterprise: true },
      },
      {
        label: 'IP Address Restrictions',
        docsHref: '/docs/access/ip-access-rules',
        values: { free: false, production: false, premium: true, enterprise: true },
      },
      {
        label: 'SCIM Administration',
        docsHref: '/docs/api/scim/overview',
        values: { free: false, production: false, premium: false, enterprise: true },
      },
      {
        label: 'External Log Streaming',
        docsHref: '/docs/integration/log-streaming',
        values: { free: false, production: false, premium: true, enterprise: true },
      },
    ],
  },
  {
    title: 'Compliance and Agreements',
    note: {
      prefix: 'See',
      link: { text: 'Medplum’s compliance documentation', href: '/docs/compliance' },
      suffix:
        'for our SOC 2 Type II audit, HITRUST e1 certification for our AWS-hosted platform, and ONC-certified product.',
    },
    rows: [
      {
        label: 'ONC-Certified EHR',
        docsHref: '/docs/compliance/onc',
        description: 'Available under your Medplum agreement.',
        values: { free: false, production: false, premium: true, enterprise: true },
      },
      {
        label: 'ONC Certification Guidance',
        description: 'Guidance on certification paths for custom applications and self-hosted deployments.',
        values: { free: false, production: false, premium: true, enterprise: true },
      },
      {
        label: 'Security Incident Response',
        description: 'Incident response assistance, scoped separately from the availability SLA.',
        values: {
          free: false,
          production: 'Paid Add-On',
          premium: 'Paid Add-On',
          enterprise: 'Paid Add-On',
        },
      },
      {
        label: 'Audit Support',
        description: 'Support during audits required by health system and payer partnerships.',
        values: { free: false, production: false, premium: false, enterprise: true },
      },
      {
        label: 'Standard MSA',
        values: { free: false, production: true, premium: true, enterprise: true },
      },
      {
        label: 'Standard BAA',
        values: {
          free: false,
          production: true,
          premium: true,
          enterprise: 'Included for hosted',
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
        values: { free: false, production: false, premium: true, enterprise: true },
      },
      {
        label: 'Assigned Deployment Strategist',
        description: 'Product and workflow design, implementation strategy, and stakeholder alignment.',
        values: { free: false, production: false, premium: false, enterprise: true },
      },
      {
        label: 'Support Channels',
        values: {
          free: 'Discord and GitHub',
          production: 'Discord and GitHub',
          premium: 'Private Slack and email',
          enterprise: 'Agreed support channels',
        },
      },
      {
        label: 'Hosted Availability SLA',
        description: 'Does not apply to customer-operated infrastructure.',
        values: {
          free: false,
          production: false,
          premium: 'Per agreement',
          enterprise: 'Per agreement',
        },
      },
      {
        label: 'Shared Roadmap',
        values: { free: false, production: false, premium: false, enterprise: true },
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
    cta: 'Contact Us',
    href: salesUrl,
  },
  {
    id: 'premium',
    name: 'Premium',
    audience: 'For production applications that need integrations and dedicated technical support.',
    price: '$6,000',
    startingPrice: true,
    period: '/month',
    cta: 'Contact Us',
    href: salesUrl,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'For organizations with complex workflow, integration, or hosting requirements.',
    cta: 'Contact Us',
    href: salesUrl,
  },
];
