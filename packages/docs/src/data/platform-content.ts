// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface WorkflowItem {
  name: string;
  icon: string;
  short: string;
  body: string;
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
  identifier: string;
  protocol: string;
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
  'Medplum is an open-source, FHIR-native healthcare platform. Our modular building blocks let your team move fast, stay compliant, and avoid getting locked into a rigid system.';

export const TIER_INTRO_HEADLINE = 'Build outward from one data model.';

export const TIER_INTRO_SUB =
  'Foundations are what you build with — programmable, open source, and FHIR-native. Workflows are what you build on — clinical patterns with the hard parts already solved, backed by first party integrations. Apps are what you ship — your custom apps, plus reference implementations ready to deploy, fork, or learn from.';

export const FOUNDATIONS: FoundationItem[] = [
  {
    name: 'FHIR Data Store & API',
    icon: 'IconDatabase',
    short: 'Native FHIR R4 datastore',
    body: 'Every resource, search parameter, and reference relationship modeled to FHIR R4 out of the box. REST, GraphQL, and time-aware search are built in.',
    identifier: '/fhir/R4',
    protocol: 'REST · GraphQL',
  },
  {
    name: 'JavaScript SDK',
    icon: 'IconCode',
    short: 'Typed client for every resource',
    body: 'TypeScript clients for browser and Node. Auth, search, paging, batch bundles, and subscriptions are one method call away. Plus @medplum/react — pre-built clinical UI components, browsable in Storybook.',
    identifier: '@medplum/core',
    protocol: 'TypeScript',
  },
  {
    name: 'Bots',
    icon: 'IconRobot',
    short: 'Sandboxed serverless runtime',
    body: 'TypeScript functions that run inside Medplum, triggered by resource changes, schedules, or HTTP. Handle HL7 transforms, eligibility, and notifications.',
    identifier: 'medplum.bots',
    protocol: 'TypeScript · serverless',
  },
  {
    name: 'Subscriptions',
    icon: 'IconWebhook',
    short: 'Rest-hook & WebSocket events',
    body: 'FHIR Subscriptions in two flavors: rest-hook webhooks for server-to-server delivery and WebSocket events for real-time clients. Retry, HMAC signing, and audit logging built in.',
    identifier: 'Subscription',
    protocol: 'rest-hook · WebSocket',
  },
  {
    name: 'Agent',
    icon: 'IconAntenna',
    short: 'On-prem bridge to the cloud',
    body: 'Runs in your local network and tunnels HL7v2 and DICOM to the cloud over encrypted WebSockets. A modern alternative to legacy interface engines.',
    identifier: 'medplum-agent',
    protocol: 'HL7v2 · DICOM',
  },
];

export const WORKFLOWS: WorkflowItem[] = [
  {
    name: 'Intake & Registration',
    icon: 'IconClipboardList',
    short: 'Forms, consent, and patient setup.',
    body: 'Digital intake forms, consent capture, and patient record creation. Built on FHIR Questionnaire and Patient resources with SDC extract.',
  },
  {
    name: 'Scheduling',
    icon: 'IconCalendar',
    short: 'Calendars, clinics, equipment slots.',
    body: 'Practitioner calendars, multi-location clinics, and equipment slots. Built on FHIR Schedule, Slot, and Appointment.',
  },
  {
    name: 'Charting',
    icon: 'IconNotes',
    short: 'Encounters, notes, and orders.',
    body: 'Structured encounter documentation, SOAP notes, clinical decision support hooks, and order entry. Built on FHIR Encounter, Observation, and ServiceRequest.',
  },
  {
    name: 'Diagnostic Orders',
    icon: 'IconTestPipe',
    short: 'Order, route, and resolve reports.',
    body: 'Order, route, and resolve diagnostic reports across reference labs. HL7 in, FHIR out, with reflex logic and result review workflows.',
  },
  {
    name: 'Medications',
    icon: 'IconPill',
    short: 'Order, dispense, and reconcile.',
    body: 'Medication ordering, dispensing records, and reconciliation. Built on FHIR MedicationRequest and MedicationDispense.',
  },
  {
    name: 'Care Coordination',
    icon: 'IconHeartHandshake',
    short: 'Care plans, tasks, and referrals.',
    body: 'Care plan management, task assignment, referral tracking, and transitions of care. Built on FHIR CarePlan, Task, and ServiceRequest.',
  },
  {
    name: 'Messaging & Communications',
    icon: 'IconMessage',
    short: 'Patient, care-team, SMS, and email.',
    body: 'Patient threads, care-team chat, SMS, and email. Threaded around encounters so messages document and bill correctly.',
  },
  {
    name: 'Billing & Payments',
    icon: 'IconReceipt',
    short: 'Charges, claims, eligibility, payments.',
    body: 'Charge capture, claims, eligibility, and patient payments on the FHIR Financial Module — same datastore as your clinical data.',
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
    name: 'Provider App',
    tagline: 'Open-source clinician EHR',
    body: 'A working EHR shell for clinicians: charting, orders, messaging, schedule, and more. Fork it, pull code from it, or use it as just a reference.',
  },
  {
    id: 'admin',
    name: 'app.medplum.com',
    tagline: 'Admin & developer console',
    body: 'The full FHIR datastore, project admin, AccessPolicy editor, Bot editor, and Questionnaire builder. Your developer and admin console from day one.',
  },
  {
    id: 'foo-medical',
    name: 'Foo Medical',
    tagline: 'Reference patient portal',
    body: 'A patient-facing portal with intake forms, appointments, messaging, and health records. The starting point for your member experience.',
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
