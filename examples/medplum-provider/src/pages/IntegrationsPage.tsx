// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex } from '@mantine/core';
import { JSX } from 'react';
import { IntegrationCard } from '../components/IntegrationCard';

interface Integration {
  name: string;
  tags: string[];
  description: string;
  displayUrl: string;
  url: string;
  imageUrl: string;
}

const integrations = [
  {
    name: 'Okta',
    tags: ['Authentication'],
    description: 'Implement SSO for healthcare staff with HIPAA-compliant authentication protocols.',
    displayUrl: 'okta.com',
    url: 'https://www.okta.com',
    imageUrl: 'okta.png',
  },
  {
    name: 'Auth0',
    tags: ['Authentication'],
    description: 'Manage identity access for patient portals and provider applications across multiple platforms.',
    displayUrl: 'auth0.com',
    url: 'https://auth0.com',
    imageUrl: 'auth0.png',
  },
  {
    name: 'Google Authentication',
    tags: ['Authentication'],
    description: "Add Google's authentication system to your EHR for standardized sign-in.",
    displayUrl: 'cloud.google.com',
    url: 'https://cloud.google.com/identity',
    imageUrl: 'google.png',
  },
  {
    name: 'Microsoft Entra SSO',
    tags: ['Authentication'],
    description: "Integrate Microsoft's identity platform with clinical systems for centralized access management.",
    displayUrl: 'microsoft.com',
    url: 'https://learn.microsoft.com/en-us/entra/identity-platform',
    imageUrl: 'entra.png',
  },
  {
    name: 'Labcorp',
    tags: ['Diagnostics'],
    description: 'Place orders and receive lab results directly in your EHR from Labcorp.',
    displayUrl: 'labcorp.com',
    url: 'https://www.labcorp.com',
    imageUrl: 'labcorp.png',
  },
  {
    name: 'Quest Diagnostics',
    tags: ['Diagnostics'],
    description: 'Place orders and receive lab results directly in your EHR from Quest.',
    displayUrl: 'questdiagnostics.com',
    url: 'https://www.questdiagnostics.com',
    imageUrl: 'quest.png',
  },
  {
    name: 'Health Gorilla',
    tags: ['HIE', 'Diagnostics'],
    description:
      'Access nationwide clinical data networks for patient records diagnostic reports and ADT notifications.',
    displayUrl: 'healthgorilla.com',
    url: 'https://www.healthgorilla.com',
    imageUrl: 'healthgorilla.png',
  },
  {
    name: 'Candid Health',
    tags: ['Billing'],
    description:
      'Integrate automated eligibility verification and claims processing with your practice management system.',
    displayUrl: 'candidhealth.com',
    url: 'https://www.candidhealth.com',
    imageUrl: 'candid.png',
  },
  {
    name: 'Particle',
    tags: ['HIE'],
    description: 'Import and export clinical data with other healthcare organizations through standardized models.',
    displayUrl: 'particlehealth.com',
    url: 'https://www.particlehealth.com',
    imageUrl: 'particle.png',
  },
  {
    name: 'Epic Systems',
    tags: ['EHR'],
    description: 'Connect to your existing Epic EHR through FHIR APIs to exchange clinical data.',
    displayUrl: 'epic.com',
    url: 'https://www.epic.com',
    imageUrl: 'epic.png',
  },
  {
    name: 'reCAPTCHA',
    tags: ['Security'],
    description: 'Implement bot protection for online patient registration forms while maintaining usability.',
    displayUrl: 'google.com/recaptcha',
    url: 'https://www.google.com/recaptcha',
    imageUrl: 'recaptcha.png',
  },
  {
    name: 'Datadog',
    tags: ['Observability'],
    description: 'Monitor healthcare application performance to identify issues before they impact clinical workflows.',
    displayUrl: 'datadog.com',
    url: 'https://www.datadog.com',
    imageUrl: 'datadog.png',
  },
  {
    name: 'Sumo Logic',
    tags: ['Observability'],
    description: 'Analyze system logs and user activities across healthcare IT systems for compliance verification.',
    displayUrl: 'sumologic.com',
    url: 'https://www.sumologic.com',
    imageUrl: 'sumo.png',
  },
  {
    name: 'Snowflake',
    tags: ['Data warehouse'],
    description:
      'Store clinical and operational data in a cloud database with access controls, allowing for analysis and reporting without managing physical servers.',
    displayUrl: 'snowflake.com',
    url: 'https://www.snowflake.com',
    imageUrl: 'snowflake.png',
  },
  {
    name: 'OpenAI',
    tags: ['AI'],
    description: 'Implement AI-powered features for clinical documentation and workflow management.',
    displayUrl: 'openai.com',
    url: 'https://openai.com',
    imageUrl: 'openai.png',
  },
  {
    name: 'Stripe',
    tags: ['Billing'],
    description:
      'Send invoices, process payments, and automate reconciliation to complement your revenue cycle management.',
    displayUrl: 'stripe.com',
    url: 'https://stripe.com',
    imageUrl: 'stripe.png',
  },
  {
    name: 'Acuity Scheduling',
    tags: ['Scheduling'],
    description: 'Manage your clinical availability and appointments with comprehensive scheduling tools.',
    displayUrl: 'acuityscheduling.com',
    url: 'https://www.acuityscheduling.com',
    imageUrl: 'acuity.png',
  },
  {
    name: 'Cal.com',
    tags: ['Scheduling'],
    description: 'Open source scheduling platform for managing availability and appointments.',
    displayUrl: 'cal.com',
    url: 'https://cal.com',
    imageUrl: 'calcom.png',
  },
  {
    name: 'Claude',
    tags: ['AI'],
    description: 'Implement AI-powered features for clinical documentation and workflow management.',
    displayUrl: 'anthropic.com/claude',
    url: 'https://www.anthropic.com/claude',
    imageUrl: 'claude.png',
  },
  {
    name: 'DeepSeek',
    tags: ['AI'],
    description: 'Implement AI-powered features for clinical documentation and workflow management.',
    displayUrl: 'deepseek.com',
    url: 'https://www.deepseek.com',
    imageUrl: 'deepseek.png',
  },
  {
    name: 'Azure',
    tags: ['Cloud Services'],
    description: 'Deploy HIPAA-compliant applications with specialized services for protected health information.',
    displayUrl: 'azure.microsoft.com',
    url: 'https://azure.microsoft.com',
    imageUrl: 'azure.png',
  },
  {
    name: 'Healthie',
    tags: ['EHR', 'Practice Management'],
    description: 'Connect to your existing Helathie account to exchange clinical data.',
    displayUrl: 'gethealthie.com',
    url: 'https://gethealthie.com',
    imageUrl: 'healthie.png',
  },
];

export function IntegrationsPage(): JSX.Element {
  function requestIntegration(integration: Integration): void {
    const subject = `Integration Request: ${integration.name}`;
    const body = `Hello Medplum team,\n\nI would like to request an integration with ${integration.name}.\n\nHere are the details:\n\nName: ${integration.name}\nDescription: ${integration.description}\nURL: ${integration.url}\n\nThank you!`;
    window.location.href = `mailto:hello@medplum.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <Flex mih={50} gap="md" justify="center" align="flex-end" direction="row" wrap="wrap" m="xl">
      {integrations.map((i) => (
        <IntegrationCard
          key={i.name}
          name={i.name}
          displayUrl={i.displayUrl}
          url={i.url}
          tags={i.tags}
          description={i.description}
          imageUrl={`/img/integrations/${i.imageUrl}`}
          onClick={() => requestIntegration(i)}
        />
      ))}
    </Flex>
  );
}
