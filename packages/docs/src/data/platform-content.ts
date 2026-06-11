// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface WorkflowItem {
  name: string;
  icon: string;
  short: string;
}

export interface IntegrationCategoryItem {
  name: string;
  icon: string;
  description: string;
}

export interface FoundationItem {
  name: string;
  icon: string;
  short: string;
  body: string;
}

export interface AppItem {
  id: string;
  name: string;
  tagline: string;
  body: string;
}

export interface ComplianceItem {
  label: string;
  sub: string;
  img: string | null;
}

export const HERO_HEADLINE = 'The platform underneath your healthcare product';

export const HERO_SUB =
  'Medplum is an open-source, standards forward healthcare platform. Our modular building blocks let your team move fast, stay compliant, and avoid getting locked into a rigid system.';

export const TIER_INTRO_HEADLINE = 'Build outward from one data model.';

export const TIER_INTRO_SUB =
  'One standards-based FHIR data model underneath everything. Foundations are what you build with, workflows are what you build on, apps are what you ship.';

export const FOUNDATIONS: FoundationItem[] = [
  {
    name: 'FHIR Data Store & API',
    icon: 'IconDatabase',
    short: 'Native FHIR R4 datastore',
    body: 'Every FHIR R4 resource, search parameter, and reference modeled out of the box — REST, GraphQL, and time-aware search built in. Hosted terminology (SNOMED, LOINC, RxNorm) on the same store.',
  },
  {
    name: 'TypeScript / JavaScript SDK',
    icon: 'IconCode',
    short: 'Typed client for every resource',
    body: 'A fully typed client for browser and Node. Auth, search, paging, batch bundles, and subscriptions are one method call away.',
  },
  {
    name: 'React Storybook',
    icon: 'IconBrandStorybook',
    short: 'Pre-built clinical UI components',
    body: 'Pre-built clinical UI React components (@medplum/react) — resource forms, search controls, and timelines, browsable in Storybook.',
  },
  {
    name: 'Bots',
    icon: 'IconRobot',
    short: 'Sandboxed serverless runtime',
    body: 'TypeScript functions that run inside Medplum, triggered by resource changes, schedules, or HTTP. Handle HL7 transforms, eligibility, and notifications.',
  },
  {
    name: 'Subscriptions',
    icon: 'IconWebhook',
    short: 'Rest-hook & WebSocket events',
    body: 'FHIR Subscriptions in two flavors: rest-hook webhooks for server-to-server delivery and WebSocket events for real-time clients. Retry, HMAC signing, and audit logging built in.',
  },
  {
    name: 'Medplum Bridge',
    icon: 'IconAntenna',
    short: 'On-prem bridge to the cloud',
    body: 'Medplum software that runs on-prem inside your firewall and tunnels HL7v2 and DICOM to the cloud over encrypted WebSockets. A modern alternative to legacy interface engines.',
  },
  {
    name: 'Medplum Auth',
    icon: 'IconLock',
    short: 'Auth API & identity provider',
    body: "Medplum's Auth API: a complete identity provider with OAuth2, OpenID Connect, SMART on FHIR, and MFA — or federate with your own.",
  },
  {
    name: 'Access Control & Tenancy',
    icon: 'IconShieldLock',
    short: 'AccessPolicy & multi-tenant Projects',
    body: 'Fine-grained authorization modeled in FHIR: granular AccessPolicy resources and multi-tenant Projects for clean data isolation.',
  },
];

export const WORKFLOWS: WorkflowItem[] = [
  {
    name: 'Intake & Registration',
    icon: 'IconClipboardList',
    short: 'Forms, consent, and patient setup.',
  },
  {
    name: 'Scheduling',
    icon: 'IconCalendar',
    short: 'Calendars, clinics, equipment slots.',
  },
  {
    name: 'Charting',
    icon: 'IconNotes',
    short: 'Encounters, notes, and orders.',
  },
  {
    name: 'Diagnostic Orders',
    icon: 'IconTestPipe',
    short: 'Order, route, and resolve reports.',
  },
  {
    name: 'Medications',
    icon: 'IconPill',
    short: 'Order, dispense, and reconcile.',
  },
  {
    name: 'Care Coordination',
    icon: 'IconHeartHandshake',
    short: 'Care plans, tasks, and referrals.',
  },
  {
    name: 'Messaging & Communications',
    icon: 'IconMessage',
    short: 'Patient, care-team, SMS, and email.',
  },
  {
    name: 'Billing & Payments',
    icon: 'IconReceipt',
    short: 'Charges, claims, eligibility, payments.',
  },
];

export const INTEGRATION_CATEGORIES: IntegrationCategoryItem[] = [
  { name: 'Electronic Prescribing', icon: 'IconPrescription', description: 'EPCS-ready prescribing.' },
  { name: 'Health Information Exchange', icon: 'IconNetwork', description: 'Records across HIEs.' },
  { name: 'Lab Connectivity', icon: 'IconTestPipe', description: 'Orders & results.' },
  { name: 'Revenue Cycle Management', icon: 'IconReceipt', description: 'Claims & eligibility.' },
  { name: 'EDI & Claims', icon: 'IconFileInvoice', description: 'X12 837/835/270/271.' },
  { name: 'Fax & Documents', icon: 'IconFileText', description: 'Fax & doc exchange.' },
];

export const ALL_APPS: AppItem[] = [
  {
    id: 'provider',
    name: 'Medplum Provider',
    tagline: 'Open-source clinician EHR',
    body: 'A working EHR shell for clinicians: charting, orders, messaging, schedule, and more. Fork it, pull code from it, or use it as just a reference.',
  },
  {
    id: 'admin',
    name: 'Medplum App',
    tagline: 'Admin & developer console',
    body: 'Access your datastore, project admin, AccessPolicy editor, Bot editor, and Questionnaire builder. Your developer and admin console from day one.',
  },
];

export const FEATURED_APPS = ALL_APPS.slice(0, 2);

export const COMPLIANCE: ComplianceItem[] = [
  { label: 'HIPAA', sub: 'Compliant', img: '/img/compliance/HIPAA-Asclepius.svg' },
  { label: 'SOC 2', sub: 'Type 2', img: '/img/compliance/soc.png' },
  { label: 'HITRUST', sub: 'CSF Certified', img: '/img/compliance/HITRUST.svg' },
  { label: 'ONC (+ HTI-4)', sub: '(g)(10) Certified', img: '/img/compliance/ONC-Certified-HealthIT.png' },
  { label: 'ISO 9001', sub: 'Quality Mgmt', img: '/img/compliance/ISO.svg' },
  { label: '21 CFR Part 11', sub: 'FDA', img: '/img/compliance/FDA.svg' },
  { label: 'EPCS', sub: 'DEA-ready', img: '/img/compliance/drummond-epcs.png' },
];
