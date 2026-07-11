// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface CapabilityItem {
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
  id: string;
  label: string;
  sub: string;
  img: string | null;
  /** Per-logo optical size tuning (px). */
  logoSize?: { height: number; maxWidth?: number };
}

export const HERO_HEADLINE = 'Fast and flexible products, for any healthcare solution';

export const HERO_SUB =
  'Our pre-built apps, capabilities, and foundations, allow you to move fast, stay compliant, and avoid getting locked into rigid systems as your organization evolves.';

export const TIER_INTRO_HEADLINE = 'Build outward from one data model.';

export const TIER_INTRO_SUB =
  'One standards-based FHIR data model underneath everything. Foundations are what you build with, capabilities are what you build on, apps are what you ship.';

export const FOUNDATIONS: FoundationItem[] = [
  {
    name: 'FHIR Data Store & API',
    icon: 'IconDatabase',
    short: 'Native FHIR R4 datastore',
    body: 'A complete healthcare data store, with every FHIR R4 resource, search parameter, and reference modeled out of the box, plus REST, GraphQL, hosted Terminology, and time-aware search built in.',
  },
  {
    name: 'TypeScript / JavaScript SDK',
    icon: 'IconCode',
    short: 'Typed client for every resource',
    body: 'A ready-made developer toolkit: a fully typed client for browser and Node, where auth, search, paging, batch bundles, and subscriptions are each one method call away.',
  },
  {
    name: 'Medplum Component Library',
    icon: 'IconComponents',
    short: 'Pre-built clinical UI components',
    body: 'Prebuilt clinical app interfaces: a library of themeable clinical UI React components (@medplum/react), including resource forms, search controls, and timelines, all wired to the data model and browsable in Storybook.',
  },
  {
    name: 'Bots',
    icon: 'IconRobot',
    short: 'Sandboxed serverless runtime',
    body: 'Automated tasks and workflows, written as TypeScript functions that run inside Medplum and trigger on resource changes, schedules, or HTTP requests. They handle HL7 transforms, eligibility checks, and notifications.',
  },
  {
    name: 'Subscriptions',
    icon: 'IconWebhook',
    short: 'Rest-hook & WebSocket events',
    body: 'Real-time event notifications through FHIR Subscriptions in two flavors: rest-hook webhooks for server-to-server delivery, and WebSocket events for live clients. Retry, HMAC signing, and audit logging are built in.',
  },
  {
    name: 'Medplum Bridge',
    icon: 'IconAntenna',
    short: 'On-prem bridge to the cloud',
    body: 'An on-site connection to the cloud. Medplum software runs on-premise inside your firewall and tunnels HL7v2 and DICOM to the cloud over encrypted WebSockets, a modern alternative to legacy interface engines.',
  },
  {
    name: 'Medplum Auth',
    icon: 'IconLock',
    short: 'Auth API & identity provider',
    body: "Sign-in and identity management through Medplum's Auth API, a complete identity provider with OAuth2, OpenID Connect, SMART on FHIR, and MFA, or you can federate with your own.",
  },
  {
    name: 'Access Control',
    icon: 'IconShieldLock',
    short: 'Fine-grained AccessPolicy',
    body: 'Fine-grained control over who can access what, modeled in FHIR. Granular AccessPolicy resources govern read and write access down to the resource, compartment, and field level.',
  },
  {
    name: 'Multi-Tenancy',
    icon: 'IconBuildingCommunity',
    short: 'Project-based data isolation',
    body: 'Isolated data per customer. Medplum Projects partition every resource into separate tenants on one deployment, giving you clean data isolation per customer, clinic, or environment, with no shared state between them.',
  },
  {
    name: 'Audit Logging',
    icon: 'IconHistory',
    short: 'Compliance-grade audit trail',
    body: 'A compliance-ready audit trail. Every read, write, and login is captured as a FHIR AuditEvent, giving you a complete, queryable record built in that satisfies the logging requirements behind HIPAA, SOC 2, and ONC certification.',
  },
];

export const CAPABILITIES: CapabilityItem[] = [
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
    tagline: 'Open-source EHR',
    body: 'A working EHR shell for clinicians: charting, orders, messaging, schedule, and more. Fork it, pull code from it, or use it as just a reference.',
  },
  {
    id: 'admin',
    name: 'Medplum App',
    tagline: 'Admin & Developer Console',
    body: 'Access your datastore, project admin, AccessPolicy editor, Bot editor, and Questionnaire builder. Your developer and admin console from day one.',
  },
];

export const FEATURED_APPS = ALL_APPS.slice(0, 2);

export const COMPLIANCE: ComplianceItem[] = [
  {
    id: 'hipaa',
    label: 'HIPAA',
    sub: 'Compliant',
    img: '/img/compliance/HIPAA-Asclepius.svg',
    logoSize: { height: 46 },
  },
  { id: 'soc2', label: 'SOC 2', sub: 'Type 2', img: '/img/compliance/soc.png', logoSize: { height: 30 } },
  {
    id: 'hitrust',
    label: 'HITRUST',
    sub: 'CSF Certified',
    img: '/img/compliance/HITRUST.svg',
    logoSize: { height: 19 },
  },
  {
    id: 'onc',
    label: 'ONC (+ HTI-4)',
    sub: '(g)(10) Certified',
    img: '/img/compliance/ONC-Certified-HealthIT.png',
    logoSize: { height: 17, maxWidth: 115 },
  },
  { id: 'iso', label: 'ISO 9001', sub: 'Quality Mgmt', img: '/img/compliance/ISO.svg', logoSize: { height: 23 } },
  { id: 'fda', label: '21 CFR Part 11', sub: 'FDA', img: '/img/compliance/FDA.svg', logoSize: { height: 24 } },
  { id: 'epcs', label: 'EPCS', sub: 'DEA-ready', img: '/img/compliance/drummond-epcs.png', logoSize: { height: 32 } },
];
